/**
 * browser-alpha-matting
 *
 * Zero-dependency client-side alpha-matting, hybrid neural + Euclidean RGB color-key fusion,
 * separable O(W*H) morphological edge refinement, bilinear 4K proxy-mask upsampling,
 * foreground color decontamination, and Transferable Web Worker bridge for browser runtimes.
 *
 * @license MIT
 */

/**
 * Extracts an 8-bit alpha mask (0..255) using 3D Euclidean RGB distance from a target backdrop color.
 * Preserves anti-aliased strokes via a smooth linear ramp between [tolerance, tolerance + softness]
 * and opens interior typographic counters (e.g., inside O, A, B, P, R) that saliency CNNs fill in.
 *
 * @param {Uint8Array | Uint8ClampedArray} rgba - Interleaved 4-channel RGBA buffer (length = width * height * 4)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {Object} [options]
 * @param {[number, number, number]} [options.keyRgb=[255, 255, 255]] - Target backdrop RGB tuple
 * @param {number} [options.tolerance=30] - Inner Euclidean RGB distance deadzone (0..255)
 * @param {number} [options.softness=18] - Ramp width for smooth anti-aliased edge transitions
 * @returns {Uint8Array} 8-bit single-channel alpha buffer (length = width * height)
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
    if (srcA === 0) {
      alpha[i] = 0;
      continue;
    }

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
 * Fuses an 8-bit neural saliency mask (e.g., briaai/RMBG-1.4 WebGPU/WASM output) with a deterministic
 * Euclidean RGB color-key mask inside browser memory.
 *
 * Modes:
 * - 'neural-with-counters': Retains the neural mask as the outer subject envelope while carving out
 *   enclosed interior background holes (counters inside letters or handle cutouts) matched by colorKeyAlpha.
 * - 'min': Strict intersection of both masks.
 * - 'max': Union of both masks.
 *
 * @param {Uint8Array} neuralAlpha - 8-bit alpha mask from neural segmentation (length = N)
 * @param {Uint8Array} colorKeyAlpha - 8-bit alpha mask from extractColorKeyAlpha (length = N)
 * @param {Object} [options]
 * @param {'neural-with-counters' | 'min' | 'max'} [options.mode='neural-with-counters']
 * @param {number} [options.interiorConfidence=200] - Neural alpha threshold above which enclosed holes are carved
 * @returns {Uint8Array} Fused 8-bit alpha mask
 */
export function fuseHybridAlpha(neuralAlpha, colorKeyAlpha, options = {}) {
  if (neuralAlpha.length !== colorKeyAlpha.length) {
    throw new RangeError('neuralAlpha and colorKeyAlpha buffers must have identical length');
  }
  const mode = options.mode ?? 'neural-with-counters';
  const interiorConfidence = options.interiorConfidence ?? 200;
  const len = neuralAlpha.length;
  const out = new Uint8Array(len);

  if (mode === 'min') {
    for (let i = 0; i < len; i++) {
      out[i] = neuralAlpha[i] < colorKeyAlpha[i] ? neuralAlpha[i] : colorKeyAlpha[i];
    }
    return out;
  }

  if (mode === 'max') {
    for (let i = 0; i < len; i++) {
      out[i] = neuralAlpha[i] > colorKeyAlpha[i] ? neuralAlpha[i] : colorKeyAlpha[i];
    }
    return out;
  }

  // 'neural-with-counters': keep neural soft hair/fur transitions along uncertain boundaries,
  // while allowing confident color-key zeroing to open trapped background pockets inside solid regions.
  for (let i = 0; i < len; i++) {
    const na = neuralAlpha[i];
    const ca = colorKeyAlpha[i];
    if (na === 0) {
      out[i] = 0;
    } else if (na >= interiorConfidence && ca < 64) {
      out[i] = ca;
    } else {
      out[i] = na;
    }
  }
  return out;
}

/**
 * Bilinearly upsamples a low-resolution proxy alpha tensor (e.g. 1024x1024 WebGPU neural output)
 * onto the source image's native resolution (e.g. 4000x3000 4K camera pixels) in pure TypedArrays.
 * Decoupling proxy inference from native pixel compositing prevents WebAssembly OOM tab crashes on 4K images.
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
 * Shifts the alpha boundary inward (negative shiftPx = morphological erosion) or outward
 * (positive shiftPx = morphological dilation) using two separable 1D passes.
 *
 * @param {Uint8Array} alpha
 * @param {number} width
 * @param {number} height
 * @param {number} shiftPx - Integer radius in pixels (-10..+10); 0 returns a copy
 * @returns {Uint8Array}
 */
export function shiftAlphaBoundary(alpha, width, height, shiftPx) {
  const radius = Math.round(shiftPx);
  if (radius === 0) return new Uint8Array(alpha);

  const dilate = radius > 0;
  const r = Math.min(16, Math.abs(radius));
  const horiz = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);

  // Pass 1: Horizontal 1D min/max filter
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

  // Pass 2: Vertical 1D min/max filter
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

/**
 * Separable O(W * H) sliding-accumulator box feathering pass (two iterations approximate a Gaussian kernel).
 * Softens stair-stepped binary transitions around hair curls, fur, and curved product shoulders.
 *
 * @param {Uint8Array} alpha
 * @param {number} width
 * @param {number} height
 * @param {number} radiusPx - Feather radius in pixels (0..12)
 * @returns {Uint8Array}
 */
export function featherAlphaSeparable(alpha, width, height, radiusPx) {
  const r = Math.max(0, Math.round(radiusPx));
  if (r === 0) return new Uint8Array(alpha);

  let src = new Uint8Array(alpha);
  const tmp = new Uint8Array(width * height);
  const dst = new Uint8Array(width * height);
  const kernelSize = 2 * r + 1;

  // Two separable box passes -> piecewise linear tent blur
  for (let pass = 0; pass < 2; pass++) {
    // Horizontal sliding accumulator
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

    // Vertical sliding accumulator
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

/**
 * Foreground Color Decontamination (Anti-Halo Edge Purification).
 * Semi-transparent boundary pixels (0 < alpha < 245) in real photographs contain a linear mixture
 * of true foreground RGB and background light (e.g., white studio sweep or green screen).
 * Propagating nearby high-opacity foreground RGB outward into boundary pixels eliminates bright fringes
 * when the cutout is composited onto dark layouts.
 *
 * @param {Uint8Array | Uint8ClampedArray} rgba - Interleaved RGBA buffer (copied, not mutated)
 * @param {Uint8Array} alpha - 8-bit alpha mask (length = width * height)
 * @param {number} width
 * @param {number} height
 * @param {number} [passes=3] - Number of outward 8-connected propagation iterations
 * @returns {Uint8ClampedArray} Decontaminated RGBA buffer with alpha applied to channel 3
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

/**
 * Composites native-resolution foreground RGBA + 8-bit alpha mask into either a 32-bit transparent
 * RGBA buffer (when backdropRgb is null) or an opaque RGB backdrop (e.g. #FFFFFF [255,255,255]).
 *
 * @param {Uint8Array | Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} alpha
 * @param {[number, number, number] | null} [backdropRgb=null]
 * @returns {Uint8ClampedArray}
 */
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

/**
 * Computes the tight non-zero alpha bounding box with optional proportional padding
 * (e.g., paddingRatio = 0.08 yields ~85% subject fill for marketplace product framing).
 *
 * @param {Uint8Array} alpha
 * @param {number} width
 * @param {number} height
 * @param {number} [threshold=12]
 * @param {number} [paddingRatio=0.05]
 * @returns {{ x: number, y: number, width: number, height: number, isEmpty: boolean }}
 */
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

/**
 * Creates a Promise-based Web Worker bridge using zero-copy Transferable ArrayBuffers
 * so WebGPU / WebAssembly neural inference executes off the main UI thread.
 *
 * @param {string | URL} workerUrl - Module worker URL
 * @returns {{ segmentRgba: (rgba: Uint8ClampedArray, width: number, height: number) => Promise<{ alpha: Uint8Array, device: string }>, terminate: () => void }}
 */
export function createMattingWorkerBridge(workerUrl) {
  const worker = new Worker(workerUrl, { type: 'module' });
  let nextId = 1;
  const pending = new Map();

  worker.onmessage = (event) => {
    const msg = event.data;
    if (!msg || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);

    if (msg.error) {
      reject(new Error(msg.error));
    } else {
      resolve({
        alpha: new Uint8Array(msg.alphaBuffer),
        device: msg.device || 'wasm',
      });
    }
  };

  worker.onerror = (err) => {
    for (const { reject } of pending.values()) {
      reject(new Error(err.message || 'Matting Web Worker runtime error'));
    }
    pending.clear();
  };

  return {
    segmentRgba(rgba, width, height) {
      const id = nextId++;
      const copy = new Uint8ClampedArray(rgba);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage(
          { id, type: 'segment', rgbaBuffer: copy.buffer, width, height },
          [copy.buffer]
        );
      });
    },
    terminate() {
      pending.clear();
      worker.terminate();
    },
  };
}
