import Foundation

/// Pure Swift 5.9 reference implementation of cubic Hermite soft-ramp alpha matting,
/// boundary foreground color-spill decontamination, and NEMA DICOM PS3.3 Section 10.7
/// anisotropic pixel-spacing Euclidean geometry.
public enum BrowserAlphaMatting {

    public struct RGB8: Equatable, Sendable {
        public let r: UInt8
        public let g: UInt8
        public let b: UInt8
        public init(r: UInt8, g: UInt8, b: UInt8) {
            self.r = r
            self.g = g
            self.b = b
        }
    }

    public struct RGBA8: Equatable, Sendable {
        public let r: UInt8
        public let g: UInt8
        public let b: UInt8
        public let a: UInt8
        public init(r: UInt8, g: UInt8, b: UInt8, a: UInt8) {
            self.r = r
            self.g = g
            self.b = b
            self.a = a
        }
    }

    public struct MattingConfig: Equatable, Sendable {
        public var tolerance: Double
        public var softness: Double
        public var deconStrength: Double

        public init(tolerance: Double = 34.0, softness: Double = 22.0, deconStrength: Double = 0.75) {
            self.tolerance = tolerance
            self.softness = softness
            self.deconStrength = deconStrength
        }
    }

    @inlinable
    public static func clamp(_ x: Double, min lo: Double, max hi: Double) -> Double {
        Swift.max(lo, Swift.min(hi, x))
    }

    /// Evaluates cubic Hermite smoothstep `3t^2 - 2t^3` across `[edge0, edge1]`.
    @inlinable
    public static func hermiteSmoothstep(edge0: Double, edge1: Double, x: Double) -> Double {
        let span = Swift.max(1e-9, edge1 - edge0)
        let t = clamp((x - edge0) / span, min: 0.0, max: 1.0)
        return t * t * (3.0 - 2.0 * t)
    }

    /// Computes BT.601 luma-weighted Euclidean distance between pixel RGB and background key.
    @inlinable
    public static func perceptualLumaDistance(_ px: RGB8, background bg: RGB8) -> Double {
        let dr = Double(px.r) - Double(bg.r)
        let dg = Double(px.g) - Double(bg.g)
        let db = Double(px.b) - Double(bg.b)
        return 1.65 * (0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db).squareRoot()
    }

    /// Computes continuous alpha in `[0, 1]` and decontaminated foreground `RGBA8`.
    public static func computePixelMatte(
        pixel: RGBA8,
        backgroundKey bg: RGB8,
        config: MattingConfig = MattingConfig()
    ) -> (alpha: Double, rgba: RGBA8) {
        let origA = Double(pixel.a) / 255.0
        let dist = perceptualLumaDistance(RGB8(r: pixel.r, g: pixel.g, b: pixel.b), background: bg)
        let rawAlpha: Double
        if dist <= config.tolerance {
            rawAlpha = 0.0
        } else if dist < config.tolerance + config.softness {
            rawAlpha = hermiteSmoothstep(edge0: config.tolerance, edge1: config.tolerance + config.softness, x: dist)
        } else {
            rawAlpha = 1.0
        }
        let alpha = rawAlpha * origA
        let aByte = UInt8(clamp((alpha * 255.0).rounded(), min: 0.0, max: 255.0))
        let decon = clamp(config.deconStrength, min: 0.0, max: 1.0)

        if alpha > 0.03 && alpha < 0.98 && decon > 0.0 {
            let safeA = Swift.max(0.18, alpha)
            func unmix(_ c: UInt8, _ bc: UInt8) -> UInt8 {
                let cf = Double(c)
                let bcf = Double(bc)
                let u = (cf - (1.0 - alpha) * bcf) / safeA
                let mixed = cf + (u - cf) * decon
                return UInt8(clamp(mixed.rounded(), min: 0.0, max: 255.0))
            }
            return (
                alpha,
                RGBA8(
                    r: unmix(pixel.r, bg.r),
                    g: unmix(pixel.g, bg.g),
                    b: unmix(pixel.b, bg.b),
                    a: aByte
                )
            )
        }
        return (alpha, RGBA8(r: pixel.r, g: pixel.g, b: pixel.b, a: aByte))
    }

    /// Computes calibrated Euclidean distance (mm) per NEMA DICOM PS3.3 Section 10.7.1.3:
    /// `rowSpacing` (Value 1) scales vertical row displacement (`p2.row - p1.row`),
    /// `colSpacing` (Value 2) scales horizontal column displacement (`p2.col - p1.col`).
    @inlinable
    public static func calibratedDistanceMm(
        rowSpacing: Double,
        colSpacing: Double,
        from p1: (col: Double, row: Double),
        to p2: (col: Double, row: Double)
    ) -> Double {
        let dx = (p2.col - p1.col) * colSpacing
        let dy = (p2.row - p1.row) * rowSpacing
        return (dx * dx + dy * dy).squareRoot()
    }
}
