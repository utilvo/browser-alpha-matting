package io.github.utilvo.alphamatting;

/**
 * Pure deterministic math utilities for unassociated 32-bit RGBA alpha matting,
 * foreground color decontamination, and zero-alpha RGB sanitization.
 */
public final class RgbaDecontaminationMath {

    private RgbaDecontaminationMath() {
    }

    /**
     * Unmixes an observed composite channel value C = alpha * F + (1 - alpha) * B
     * to recover the uncontaminated foreground channel F in [0, 255].
     *
     * @param observedChannel   Observed channel intensity [0..255]
     * @param backgroundChannel Estimated background intensity [0..255]
     * @param alphaByte         Alpha byte [0..255]
     * @param alphaFloor        Minimum alpha clamp in (0.0, 1.0) to bound noise amplification
     * @return Reconstructed foreground channel byte [0..255]
     */
    public static int unmixForegroundChannel(
            int observedChannel,
            int backgroundChannel,
            int alphaByte,
            double alphaFloor
    ) {
        if (alphaByte <= 0) {
            return 0;
        }
        if (alphaByte >= 255) {
            return clampByte(observedChannel);
        }
        double alpha = alphaByte / 255.0;
        double safeAlpha = Math.max(alpha, Math.max(0.02, alphaFloor));
        double reconstructed = (observedChannel - (1.0 - alpha) * backgroundChannel) / safeAlpha;
        return clampByte((int) Math.round(reconstructed));
    }

    /**
     * Computes composite residual error |C - (alpha * F + (1 - alpha) * B)| in [0.0, 255.0].
     */
    public static double compositeResidual(int observed, int foreground, int background, int alphaByte) {
        double alpha = clampByte(alphaByte) / 255.0;
        double predicted = alpha * foreground + (1.0 - alpha) * background;
        return Math.abs(observed - predicted);
    }

    public static int clampByte(int value) {
        return Math.max(0, Math.min(255, value));
    }
}
