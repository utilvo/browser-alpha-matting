package io.github.utilvo.alphamatting;

import org.gradle.api.Project;
import org.gradle.testfixtures.ProjectBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AlphaMattingPluginTest {

    @Test
    void registersAuditTaskAndExtension() {
        Project project = ProjectBuilder.builder().build();
        project.getPlugins().apply("io.github.utilvo.alpha-matting");

        assertNotNull(project.getExtensions().findByName("alphaMatting"));
        assertNotNull(project.getTasks().findByName("auditAlphaMatting"));
    }

    @Test
    void unmixesSemiTransparentForegroundAccurately() {
        // True foreground F=220, background B=20, alpha=128 (~0.50196) -> C = 120
        int unmixed = RgbaDecontaminationMath.unmixForegroundChannel(120, 20, 128, 0.05);
        assertTrue(Math.abs(unmixed - 220) <= 2, "Expected reconstructed foreground near 220, got " + unmixed);
        assertEquals(0, RgbaDecontaminationMath.unmixForegroundChannel(255, 255, 0, 0.05));
    }
}
