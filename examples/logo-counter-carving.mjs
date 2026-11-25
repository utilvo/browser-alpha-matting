/**
 * Node.js Runnable Example: Detecting & Carving Enclosed Typographic Counters (O / A / B)
 * Run: node examples/logo-counter-carving.mjs
 */
import {
  extractPerceptualLabAlpha,
  detectEnclosedCounters,
  fuseHybridAlpha,
} from '../src/index.js';

const W = 7;
const H = 7;
const rgba = new Uint8ClampedArray(W * H * 4);

// Fill 7x7 canvas with slightly warm off-white scan paper (251, 249, 245)
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = 251;
  rgba[i * 4 + 1] = 249;
  rgba[i * 4 + 2] = 245;
  rgba[i * 4 + 3] = 255;
}

// Draw dark ink 'O' ring from (1,1) to (5,5), leaving center (3,3) as enclosed paper counter
for (let y = 1; y <= 5; y++) {
  for (let x = 1; x <= 5; x++) {
    if (x === 3 && y === 3) continue; // enclosed inner hole
    const p = (y * W + x) * 4;
    rgba[p] = 18;
    rgba[p + 1] = 24;
    rgba[p + 2] = 38;
  }
}

// Simulate neural saliency CNN that fills the entire 5x5 bounding box as foreground (255)
const neuralAlpha = new Uint8Array(W * H);
for (let y = 1; y <= 5; y++) {
  for (let x = 1; x <= 5; x++) neuralAlpha[y * W + x] = 255;
}

const labAlpha = extractPerceptualLabAlpha(rgba, W, H, { keyRgb: [255, 255, 255], deltaETolerance: 10 });
const counters = detectEnclosedCounters(labAlpha, W, H, 32);
const hybrid = fuseHybridAlpha(neuralAlpha, labAlpha, { mode: 'neural-with-counters' });

console.log('Enclosed counter detected at (3,3):', counters[3 * W + 3] === 255);
console.log('Hybrid alpha at (3,3) carved to 0 :', hybrid[3 * W + 3] === 0);
