/**
 * @module morphology
 * Separable O(W*H) morphological boundary shift, sliding-accumulator tent feathering, and subject bounding boxes.
 */

export function shiftAlphaBoundary(alpha, width, height, shiftPx) {
  const radius = Math.round(shiftPx);
  if (radius === 0) return new Uint8Array(alpha);

  const dilate = radius > 0;
  const r = Math.min(16, Math.abs(radius));
  const horiz = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const xStart = x - r < 0 ? 0 : x - r;
      const xEnd = x + r >= width ? width - 1 : x + r;
      let best = dilate ? 0 : 255;
      for (let kx = xStart; kx <= xEnd; kx++) {
        const v = alpha[rowOffset + kx];
        if (dilate) {
          if (v > best) best = v;
        } else if (v < best) {
          best = v;
        }
      }
      horiz[rowOffset + x] = best;
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const yStart = y - r < 0 ? 0 : y - r;
      const yEnd = y + r >= height ? height - 1 : y + r;
      let best = dilate ? 0 : 255;
      for (let ky = yStart; ky <= yEnd; ky++) {
        const v = horiz[ky * width + x];
        if (dilate) {
          if (v > best) best = v;
        } else if (v < best) {
          best = v;
        }
      }
      out[y * width + x] = best;
    }
  }

  return out;
}

export function featherAlphaSeparable(alpha, width, height, radiusPx) {
  const r = Math.max(0, Math.round(radiusPx));
  if (r === 0) return new Uint8Array(alpha);

  let src = new Uint8Array(alpha);
  const tmp = new Uint8Array(width * height);
  const dst = new Uint8Array(width * height);
  const kernelSize = 2 * r + 1;

  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = src[row] * (r + 1);
      for (let ix = 1; ix <= r; ix++) {
        sum += src[row + (ix < width ? ix : width - 1)];
      }
      for (let x = 0; x < width; x++) {
        tmp[row + x] = Math.round(sum / kernelSize);
        const removeIdx = x - r < 0 ? 0 : x - r;
        const addIdx = x + r + 1 >= width ? width - 1 : x + r + 1;
        sum += src[row + addIdx] - src[row + removeIdx];
      }
    }

    for (let x = 0; x < width; x++) {
      let sum = tmp[x] * (r + 1);
      for (let iy = 1; iy <= r; iy++) {
        sum += tmp[(iy < height ? iy : height - 1) * width + x];
      }
      for (let y = 0; y < height; y++) {
        dst[y * width + x] = Math.round(sum / kernelSize);
        const removeY = y - r < 0 ? 0 : y - r;
        const addY = y + r + 1 >= height ? height - 1 : y + r + 1;
        sum += tmp[addY * width + x] - tmp[removeY * width + x];
      }
    }

    src = new Uint8Array(dst);
  }

  return dst;
}

export function computeAlphaBoundingBox(alpha, width, height, threshold = 12, paddingRatio = 0.05) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height, isEmpty: true };
  }

  const rawW = maxX - minX + 1;
  const rawH = maxY - minY + 1;
  const padX = Math.round(rawW * paddingRatio);
  const padY = Math.round(rawH * paddingRatio);

  const x0 = Math.max(0, minX - padX);
  const y0 = Math.max(0, minY - padY);
  const x1 = Math.min(width - 1, maxX + padX);
  const y1 = Math.min(height - 1, maxY + padY);

  return {
    x: x0,
    y: y0,
    width: x1 - x0 + 1,
    height: y1 - y0 + 1,
    isEmpty: false,
  };
}
