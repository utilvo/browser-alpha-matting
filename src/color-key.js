/**
 * @module color-key
 * Deterministic 3D Euclidean sRGB and CIE76 Perceptual Lab color-key alpha extraction.
 */

/**
 * Converts a single 8-bit sRGB pixel (0..255) to CIE L*a*b* (D65 illuminant).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]} [L, a, b]
 */
export function rgbToLab(r, g, b) {
  let sr = r / 255;
  let sg = g / 255;
  let sb = b / 255;

  sr = sr > 0.04045 ? Math.pow((sr + 0.055) / 1.055, 2.4) : sr / 12.92;
  sg = sg > 0.04045 ? Math.pow((sg + 0.055) / 1.055, 2.4) : sg / 12.92;
  sb = sb > 0.04045 ? Math.pow((sb + 0.055) / 1.055, 2.4) : sb / 12.92;

  let x = (sr * 0.4124564 + sg * 0.3575761 + sb * 0.1804375) / 0.95047;
  let y = (sr * 0.2126729 + sg * 0.7151522 + sb * 0.0721750) / 1.00000;
  let z = (sr * 0.0193339 + sg * 0.1191920 + sb * 0.9503041) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * Extracts an 8-bit alpha mask (0..255) using 3D Euclidean RGB distance from a target backdrop color.
 *
 * @param {Uint8Array | Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @param {[number, number, number]} [options.keyRgb=[255, 255, 255]]
 * @param {number} [options.tolerance=30]
 * @param {number} [options.softness=18]
 * @returns {Uint8Array}
 */
export function extractColorKeyAlpha(rgba, width, height, options = {}) {
  const [kr, kg, kb] = options.keyRgb ?? [255, 255, 255];
  const tolerance = Math.max(0, Number(options.tolerance ?? 30));
  const softness = Math.max(1, Number(options.softness ?? 18));
  const totalPixels = width * height;
  const alpha = new Uint8Array(totalPixels);

  const innerSq = tolerance * tolerance;
  const outer = tolerance + softness;
  const outerSq = outer * outer;
  const invRamp = 1 / softness;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const srcA = rgba[idx + 3];
    if (srcA === 0) continue;

    const dr = rgba[idx] - kr;
    const dg = rgba[idx + 1] - kg;
    const db = rgba[idx + 2] - kb;
    const distSq = dr * dr + dg * dg + db * db;

    if (distSq <= innerSq) {
      alpha[i] = 0;
    } else if (distSq >= outerSq) {
      alpha[i] = srcA;
    } else {
      const dist = Math.sqrt(distSq);
      const t = (dist - tolerance) * invRamp;
      alpha[i] = Math.round(srcA * Math.min(1, Math.max(0, t)));
    }
  }

  return alpha;
}

/**
 * Extracts an 8-bit alpha mask using perceptual CIE76 Delta-E distance in L*a*b* space.
 * Superior to Euclidean sRGB on unevenly lit paper scans and shadowed studio sweeps.
 *
 * @param {Uint8Array | Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @param {[number, number, number]} [options.keyRgb=[255, 255, 255]]
 * @param {number} [options.deltaETolerance=12]
 * @param {number} [options.deltaESoftness=8]
 * @returns {Uint8Array}
 */
export function extractPerceptualLabAlpha(rgba, width, height, options = {}) {
  const [kr, kg, kb] = options.keyRgb ?? [255, 255, 255];
  const [kL, ka, kbLab] = rgbToLab(kr, kg, kb);
  const tol = Math.max(0, Number(options.deltaETolerance ?? 12));
  const soft = Math.max(0.5, Number(options.deltaESoftness ?? 8));
  const total = width * height;
  const alpha = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const srcA = rgba[p + 3];
    if (srcA === 0) continue;

    const [L, a, b] = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
    const dL = L - kL;
    const da = a - ka;
    const db = b - kbLab;
    const dE = Math.sqrt(dL * dL + da * da + db * db);

    if (dE <= tol) {
      alpha[i] = 0;
    } else if (dE >= tol + soft) {
      alpha[i] = srcA;
    } else {
      alpha[i] = Math.round(srcA * ((dE - tol) / soft));
    }
  }

  return alpha;
}
