/**
 * @module upsample
 * Bilinear and edge-preserving Joint Bilateral 4K proxy-mask upsamplers in pure TypedArrays.
 */

/**
 * Bilinearly upsamples a low-resolution proxy alpha tensor (e.g. 1024x1024) to native target dimensions.
 *
 * @param {Uint8Array} proxyAlpha
 * @param {number} proxyW
 * @param {number} proxyH
 * @param {number} targetW
 * @param {number} targetH
 * @returns {Uint8Array}
 */
export function upsampleAlphaBilinear(proxyAlpha, proxyW, proxyH, targetW, targetH) {
  if (proxyW === targetW && proxyH === targetH) {
    return new Uint8Array(proxyAlpha);
  }
  const out = new Uint8Array(targetW * targetH);
  const scaleX = proxyW / targetW;
  const scaleY = proxyH / targetH;
  const maxX = proxyW - 1;
  const maxY = proxyH - 1;

  for (let y = 0; y < targetH; y++) {
    const gy = (y + 0.5) * scaleY - 0.5;
    const y0 = gy < 0 ? 0 : gy > maxY ? maxY : gy | 0;
    const y1 = y0 < maxY ? y0 + 1 : maxY;
    const wy = gy < 0 ? 0 : gy > maxY ? 0 : gy - y0;
    const invWy = 1 - wy;
    const row0 = y0 * proxyW;
    const row1 = y1 * proxyW;
    const outRow = y * targetW;

    for (let x = 0; x < targetW; x++) {
      const gx = (x + 0.5) * scaleX - 0.5;
      const x0 = gx < 0 ? 0 : gx > maxX ? maxX : gx | 0;
      const x1 = x0 < maxX ? x0 + 1 : maxX;
      const wx = gx < 0 ? 0 : gx > maxX ? 0 : gx - x0;
      const invWx = 1 - wx;

      const top = proxyAlpha[row0 + x0] * invWx + proxyAlpha[row0 + x1] * wx;
      const bottom = proxyAlpha[row1 + x0] * invWx + proxyAlpha[row1 + x1] * wx;
      out[outRow + x] = Math.round(top * invWy + bottom * wy);
    }
  }
  return out;
}

/**
 * Edge-Preserving Joint Bilateral Upsampling (Kopf et al.).
 * Uses the native high-resolution RGBA guide image to snap coarse proxy alpha boundaries
 * directly onto crisp 4K RGB edges—refining only uncertain transition pixels (8 < alpha < 247)
 * so flat interior/exterior pixels cost O(1).
 *
 * @param {Uint8Array} proxyAlpha
 * @param {number} proxyW
 * @param {number} proxyH
 * @param {Uint8Array | Uint8ClampedArray} guideRgba - Native targetW * targetH * 4 guide image
 * @param {number} targetW
 * @param {number} targetH
 * @param {Object} [options]
 * @param {number} [options.sigmaColor=28]
 * @returns {Uint8Array}
 */
export function upsampleAlphaJointBilateral(
  proxyAlpha,
  proxyW,
  proxyH,
  guideRgba,
  targetW,
  targetH,
  options = {}
) {
  const base = upsampleAlphaBilinear(proxyAlpha, proxyW, proxyH, targetW, targetH);
  const sigmaColor = Math.max(1, Number(options.sigmaColor ?? 28));
  const invTwoSigmaSq = 1 / (2 * sigmaColor * sigmaColor);
  const out = new Uint8Array(base);
  const scaleX = proxyW / targetW;
  const scaleY = proxyH / targetH;
  const maxPX = proxyW - 1;
  const maxPY = proxyH - 1;

  for (let y = 0; y < targetH; y++) {
    const rowOff = y * targetW;
    for (let x = 0; x < targetW; x++) {
      const idx = rowOff + x;
      const initA = base[idx];
      if (initA <= 8 || initA >= 247) continue;

      const p = idx * 4;
      const gr = guideRgba[p];
      const gg = guideRgba[p + 1];
      const gb = guideRgba[p + 2];

      const pxCenter = Math.min(maxPX, Math.max(0, Math.round((x + 0.5) * scaleX - 0.5)));
      const pyCenter = Math.min(maxPY, Math.max(0, Math.round((y + 0.5) * scaleY - 0.5)));

      let weightedSum = 0;
      let weightTotal = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const py = Math.min(maxPY, Math.max(0, pyCenter + dy));
        const gySample = Math.min(targetH - 1, Math.max(0, Math.round((py + 0.5) / scaleY - 0.5)));
        for (let dx = -1; dx <= 1; dx++) {
          const px = Math.min(maxPX, Math.max(0, pxCenter + dx));
          const gxSample = Math.min(targetW - 1, Math.max(0, Math.round((px + 0.5) / scaleX - 0.5)));
          const sp = (gySample * targetW + gxSample) * 4;

          const dr = gr - guideRgba[sp];
          const dg = gg - guideRgba[sp + 1];
          const db = gb - guideRgba[sp + 2];
          const rangeW = Math.exp(-(dr * dr + dg * dg + db * db) * invTwoSigmaSq);
          const spatialW = dx === 0 && dy === 0 ? 1.0 : dx === 0 || dy === 0 ? 0.6 : 0.36;
          const w = rangeW * spatialW;

          weightedSum += proxyAlpha[py * proxyW + px] * w;
          weightTotal += w;
        }
      }

      if (weightTotal > 0) {
        out[idx] = Math.round(weightedSum / weightTotal);
      }
    }
  }

  return out;
}
