package io.github.utilvo.alphamatting;

import org.gradle.api.DefaultTask;
import org.gradle.api.GradleException;
import org.gradle.api.file.DirectoryProperty;
import org.gradle.api.file.RegularFileProperty;
import org.gradle.api.provider.Property;
import org.gradle.api.tasks.Input;
import org.gradle.api.tasks.InputDirectory;
import org.gradle.api.tasks.Optional;
import org.gradle.api.tasks.OutputFile;
import org.gradle.api.tasks.PathSensitive;
import org.gradle.api.tasks.PathSensitivity;
import org.gradle.api.tasks.TaskAction;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Gradle verification task that scans PNG assets for 32-bit unassociated RGBA trimap boundary
 * statistics and zero-alpha RGB byte leakage (ISO/IEC 15948).
 */
public abstract class AlphaMattingAuditTask extends DefaultTask {

    @InputDirectory
    @Optional
    @PathSensitive(PathSensitivity.RELATIVE)
    public abstract DirectoryProperty getAssetsDir();

    @OutputFile
    public abstract RegularFileProperty getReportFile();

    @Input
    public abstract Property<Double> getMaxZeroAlphaLeakRatio();

    @Input
    public abstract Property<Boolean> getFailOnDirtyZeroAlpha();

    @TaskAction
    public void auditAssets() throws IOException {
        List<File> pngFiles = new ArrayList<>();
        if (getAssetsDir().isPresent() && getAssetsDir().get().getAsFile().exists()) {
            Path root = getAssetsDir().get().getAsFile().toPath();
            try (Stream<Path> walk = Files.walk(root)) {
                pngFiles = walk
                        .filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".png"))
                        .sorted(Comparator.comparing(Path::toString))
                        .map(Path::toFile)
                        .collect(Collectors.toList());
            }
        }

        StringBuilder entriesJson = new StringBuilder();
        int dirtyFiles = 0;

        for (int idx = 0; idx < pngFiles.size(); idx++) {
            File file = pngFiles.get(idx);
            BufferedImage img = ImageIO.read(file);
            if (img == null) {
                continue;
            }
            int width = img.getWidth();
            int height = img.getHeight();
            long totalPixels = (long) width * height;
            long opaquePixels = 0;
            long transparentPixels = 0;
            long trimapUnknownPixels = 0;
            long dirtyZeroAlphaPixels = 0;

            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    int argb = img.getRGB(x, y);
                    int a = (argb >>> 24) & 0xFF;
                    int rgb = argb & 0x00FFFFFF;
                    if (a == 255) {
                        opaquePixels++;
                    } else if (a == 0) {
                        transparentPixels++;
                        if (rgb != 0) {
                            dirtyZeroAlphaPixels++;
                        }
                    } else {
                        trimapUnknownPixels++;
                    }
                }
            }

            double trimapRatio = totalPixels > 0 ? (double) trimapUnknownPixels / totalPixels : 0.0;
            double leakRatio = transparentPixels > 0 ? (double) dirtyZeroAlphaPixels / transparentPixels : 0.0;
            if (leakRatio > getMaxZeroAlphaLeakRatio().get()) {
                dirtyFiles++;
            }

            if (entriesJson.length() > 0) {
                entriesJson.append(",\n");
            }
            entriesJson.append(String.format(
                    Locale.ROOT,
                    "    {\"file\": \"%s\", \"width\": %d, \"height\": %d, \"opaquePixels\": %d, \"trimapBoundaryPixels\": %d, \"transparentPixels\": %d, \"trimapRatio\": %.6f, \"zeroAlphaRgbLeakRatio\": %.6f}",
                    file.getName().replace("\"", "\\\""),
                    width,
                    height,
                    opaquePixels,
                    trimapUnknownPixels,
                    transparentPixels,
                    trimapRatio,
                    leakRatio
            ));
        }

        File out = getReportFile().get().getAsFile();
        if (out.getParentFile() != null) {
            out.getParentFile().mkdirs();
        }
        String json = String.format(
                Locale.ROOT,
                "{\n  \"scannedPngCount\": %d,\n  \"dirtyZeroAlphaFileCount\": %d,\n  \"assets\": [\n%s\n  ]\n}\n",
                pngFiles.size(),
                dirtyFiles,
                entriesJson
        );
        Files.write(out.toPath(), json.getBytes(StandardCharsets.UTF_8));

        getLogger().lifecycle(
                "[alpha-matting] Audited {} PNG asset(s); report written to {}",
                pngFiles.size(),
                out.getAbsolutePath()
        );

        if (Boolean.TRUE.equals(getFailOnDirtyZeroAlpha().get()) && dirtyFiles > 0) {
            throw new GradleException(
                    "Alpha matting audit detected " + dirtyFiles + " PNG file(s) exceeding maxZeroAlphaLeakRatio="
                            + getMaxZeroAlphaLeakRatio().get()
            );
        }
    }
}
