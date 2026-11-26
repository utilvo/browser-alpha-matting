package io.github.utilvo.alphamatting;

import org.gradle.api.file.DirectoryProperty;
import org.gradle.api.file.RegularFileProperty;
import org.gradle.api.provider.Property;

/**
 * Configuration DSL extension for {@code alphaMatting { ... }}.
 */
public abstract class AlphaMattingExtension {

    /**
     * Directory containing PNG cutout assets to inspect during build verification.
     */
    public abstract DirectoryProperty getAssetsDir();

    /**
     * Output JSON audit report path.
     */
    public abstract RegularFileProperty getReportFile();

    /**
     * Maximum tolerated ratio (0.0 - 1.0) of transparent pixels (alpha == 0) carrying non-zero RGB bytes.
     */
    public abstract Property<Double> getMaxZeroAlphaLeakRatio();

    /**
     * Whether to fail the Gradle build if zero-alpha RGB leakage exceeds {@link #getMaxZeroAlphaLeakRatio()}.
     */
    public abstract Property<Boolean> getFailOnDirtyZeroAlpha();
}
