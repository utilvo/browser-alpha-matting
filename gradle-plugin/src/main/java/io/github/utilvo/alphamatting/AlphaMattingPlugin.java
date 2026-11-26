package io.github.utilvo.alphamatting;

import org.gradle.api.Plugin;
import org.gradle.api.Project;
import org.gradle.api.file.Directory;
import org.gradle.api.provider.Provider;

/**
 * Registers the {@code alphaMatting} DSL extension and {@code auditAlphaMatting} verification task.
 */
public class AlphaMattingPlugin implements Plugin<Project> {

    @Override
    public void apply(Project project) {
        AlphaMattingExtension extension = project.getExtensions()
                .create("alphaMatting", AlphaMattingExtension.class);

        Directory defaultAssets = project.getLayout().getProjectDirectory().dir("src/main/resources");
        if (defaultAssets.getAsFile().exists()) {
            extension.getAssetsDir().convention(defaultAssets);
        }
        extension.getReportFile().convention(
                project.getLayout().getBuildDirectory().file("reports/alpha-matting/audit-report.json")
        );
        extension.getMaxZeroAlphaLeakRatio().convention(0.05);
        extension.getFailOnDirtyZeroAlpha().convention(false);

        project.getTasks().register("auditAlphaMatting", AlphaMattingAuditTask.class, task -> {
            task.setGroup("verification");
            task.setDescription("Audits 32-bit RGBA PNG assets for trimap boundary ratios and zero-alpha RGB byte leakage.");
            task.getAssetsDir().set(extension.getAssetsDir());
            task.getReportFile().set(extension.getReportFile());
            task.getMaxZeroAlphaLeakRatio().set(extension.getMaxZeroAlphaLeakRatio());
            task.getFailOnDirtyZeroAlpha().set(extension.getFailOnDirtyZeroAlpha());
        });
    }
}
