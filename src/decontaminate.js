/**
 * @module decontaminate
 * Iterative 8-connected foreground color decontamination and native-resolution RGBA compositing.
 */

export function decontaminateForegroundColors(rgba, alpha, width, height, passes = 3) {
  const total = width * height;
  const out = new Uint8ClampedArray(rgba);
  const solid = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    out[i * 4 + 3] = alpha[i];
    if (alpha[i] >= 245) solid[i] = 1;
  }

  const nextSolid = new Uint8Array(solid);
  const iterations = Math.max(1, Math.min(8, passes));

  for (let step = 0; step < iterations; step++) {
    nextSolid.set(solid);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const a = alpha[idx];
        if (a === 0 || solid[idx] === 1) continue;

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (solid[nIdx] === 1) {
              const p = nIdx * 4;
              rSum += out[p];
              gSum += out[p + 1];
              bSum += out[p + 2];
              count++;
            }
          }
        }

        if (count > 0) {
          const p = idx * 4;
          const fgWeight = 1 - a / 255;
          const pureR = rSum / count;
          const pureG = gSum / count;
          const pureB = bSum / count;
          out[p] = Math.round(out[p] * (1 - fgWeight) + pureR * fgWeight);
          out[p + 1] = Math.round(out[p + 1] * (1 - fgWeight) + pureG * fgWeight);
          out[p + 2] = Math.round(out[p + 2] * (1 - fgWeight) + pureB * fgWeight);
          nextSolid[idx] = 1;
        }
      }
    }
    solid.set(nextSolid);
  }

  return out;
}

export function compositeNativeResolution(rgba, width, height, alpha, backdropRgb = null) {
  const total = width * height;
  const out = new Uint8ClampedArray(total * 4);

  if (!backdropRgb) {
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const a = alpha[i];
      out[p] = a === 0 ? 0 : rgba[p];
      out[p + 1] = a === 0 ? 0 : rgba[p + 1];
      out[p + 2] = a === 0 ? 0 : rgba[p + 2];
      out[p + 3] = a;
    }
    return out;
  }

  const [br, bg, bb] = backdropRgb;
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const t = alpha[i] / 255;
    const inv = 1 - t;
    out[p] = Math.round(rgba[p] * t + br * inv);
    out[p + 1] = Math.round(rgba[p + 1] * t + bg * inv);
    out[p + 2] = Math.round(rgba[p + 2] * t + bb * inv);
    out[p + 3] = 255;
  }
  return out;
}
