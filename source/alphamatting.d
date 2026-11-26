/**
 * Deterministic 32-bit unassociated RGBA alpha matting, foreground color decontamination,
 * Cubic Hermite boundary feathering, and NEMA DICOM PS3.3 Section 10.7 anisotropic pixel spacing math.
 *
 * Standards:
 *   - Porter & Duff (SIGGRAPH 1984) Compositing Digital Images
 *   - ISO/IEC 15948 (PNG) Unassociated 32-bit RGBA Channel Semantics
 *   - NEMA DICOM PS3.3 Section 10.7 Basic Pixel Spacing Calibration Macro [RowSpacing, ColumnSpacing]
 */
module alphamatting;

import std.algorithm.comparison : clamp, max, min;
import std.math : fabs, lround, sqrt;

/// Clamps an integer channel value into unsigned 8-bit [0, 255].
ubyte clampByte(int value) @safe pure nothrow @nogc
{
    return cast(ubyte) clamp(value, 0, 255);
}

/**
 * Unmixes an observed composite channel C = alpha * F + (1 - alpha) * B
 * to recover the uncontaminated foreground intensity F in [0, 255].
 */
ubyte unmixForegroundChannel(ubyte observed, ubyte background, ubyte alphaByte, double alphaFloor = 0.05) @safe pure nothrow @nogc
{
    if (alphaByte == 0)
    {
        return 0;
    }
    if (alphaByte == 255)
    {
        return observed;
    }
    const double alpha = cast(double) alphaByte / 255.0;
    const double safeAlpha = max(alpha, max(0.02, alphaFloor));
    const double reconstructed = (cast(double) observed - (1.0 - alpha) * cast(double) background) / safeAlpha;
    return clampByte(cast(int) lround(reconstructed));
}

/// Evaluates C1-continuous Cubic Hermite smoothstep 3t^2 - 2t^3 on [edge0, edge1].
double hermiteSmoothstep(double edge0, double edge1, double x) @safe pure nothrow @nogc
{
    if (edge1 <= edge0)
    {
        return x >= edge1 ? 1.0 : 0.0;
    }
    const double t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

/**
 * Computes physical Euclidean distance in millimeters per NEMA DICOM PS3.3 Section 10.7,
 * where PixelSpacing (0028,0030) is ordered [rowSpacingMm (dy), columnSpacingMm (dx)].
 */
double calibrateDicomDistanceMm(double dxPixels, double dyPixels, double rowSpacingMm, double columnSpacingMm) @safe pure nothrow @nogc
{
    const double dxMm = dxPixels * columnSpacingMm;
    const double dyMm = dyPixels * rowSpacingMm;
    return sqrt(dxMm * dxMm + dyMm * dyMm);
}

unittest
{
    // Foreground F=220, background B=20, alpha=128 -> observed C=120
    const ubyte unmixed = unmixForegroundChannel(120, 20, 128, 0.05);
    assert(unmixed >= 218 && unmixed <= 222);
    assert(unmixForegroundChannel(255, 255, 0, 0.05) == 0);

    // NEMA DICOM PS3.3 Section 10.7 anisotropic [row=0.30, col=0.25] check
    const double horizMm = calibrateDicomDistanceMm(100.0, 0.0, 0.30, 0.25);
    const double vertMm = calibrateDicomDistanceMm(0.0, 100.0, 0.30, 0.25);
    assert(fabs(horizMm - 25.0) < 1e-9);
    assert(fabs(vertMm - 30.0) < 1e-9);
}
