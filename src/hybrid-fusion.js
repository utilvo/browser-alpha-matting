/**
 * @module hybrid-fusion
 * Dual-engine mask fusion and connected-component enclosed counter detection.
 */

/**
 * Fuses an 8-bit neural saliency mask with a deterministic RGB/Lab color-key mask.
 *
 * @param {Uint8Array} neuralAlpha
 * @param {Uint8Array} colorKeyAlpha
 * @param {Object} [options]
 * @param {'neural-with-counters' | 'min' | 'max'} [options.mode='neural-with-counters']
 * @param {number} [options.interiorConfidence=200]
 * @returns {Uint8Array}
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
 * Distinguishes exterior border-connected background regions from enclosed interior pockets
 * (e.g., letter counters inside O, A, B, P or mug handles) via a non-recursive BFS flood fill.
 * Returns a Uint8Array mask where 255 marks enclosed interior holes that do not touch image borders.
 *
 * @param {Uint8Array} colorKeyAlpha - 8-bit color-key alpha where < threshold indicates backdrop color
 * @param {number} width
 * @param {number} height
 * @param {number} [threshold=32]
 * @returns {Uint8Array}
 */
export function detectEnclosedCounters(colorKeyAlpha, width, height, threshold = 32) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const enqueueIfBg = (idx) => {
    if (!visited[idx] && colorKeyAlpha[idx] < threshold) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < width; x++) {
    enqueueIfBg(x);
    enqueueIfBg((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueueIfBg(y * width);
    enqueueIfBg(y * width + (width - 1));
  }

  while (head < tail) {
    const cur = queue[head++];
    const y = (cur / width) | 0;
    const x = cur - y * width;

    if (x > 0) enqueueIfBg(cur - 1);
    if (x + 1 < width) enqueueIfBg(cur + 1);
    if (y > 0) enqueueIfBg(cur - width);
    if (y + 1 < height) enqueueIfBg(cur + width);
  }

  const enclosed = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (colorKeyAlpha[i] < threshold && visited[i] === 0) {
      enclosed[i] = 255;
    }
  }
  return enclosed;
}
