import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractColorKeyAlpha,
  fuseHybridAlpha,
  upsampleAlphaBilinear,
  shiftAlphaBoundary,
  featherAlphaSeparable,
  decontaminateForegroundColors,
  compositeNativeResolution,
  computeAlphaBoundingBox,
} from '../src/index.js';

test('extractColorKeyAlpha removes solid white backdrop and keeps foreground ink', () => {
  // 2x1 image: pixel 0 is pure white (255,255,255), pixel 1 is dark navy (15,25,60)
  const rgba = new Uint8ClampedArray([
    255, 255, 255, 255,
    15, 25, 60, 255,
  ]);
  const alpha = extractColorKeyAlpha(rgba, 2, 1, { keyRgb: [255, 255, 255], tolerance: 25, softness: 15 });
  assert.equal(alpha[0], 0);
  assert.equal(alpha[1], 255);
});

test('fuseHybridAlpha carves enclosed letter counters inside high-confidence neural regions', () => {
  // Simulate an 'O' glyph: neural saliency marks outer background 0, ring 255, AND enclosed inner hole 255
  const neuralAlpha = new Uint8Array([0, 255, 255, 0]);
  // Color-key sees pixel 2 (inside the O counter) is pure backdrop color -> alpha 0
  const colorKeyAlpha = new Uint8Array([0, 255, 0, 0]);
  const fused = fuseHybridAlpha(neuralAlpha, colorKeyAlpha, { mode: 'neural-with-counters' });
  assert.deepEqual(Array.from(fused), [0, 255, 0, 0]);
});

test('upsampleAlphaBilinear scales 2x2 proxy mask smoothly to 4x4 native resolution', () => {
  const proxy = new Uint8Array([0, 255, 0, 255]);
  const up = upsampleAlphaBilinear(proxy, 2, 2, 4, 4);
  assert.equal(up.length, 16);
  assert.equal(up[0], 0);
  assert.equal(up[3], 255);
  assert.ok(up[1] > 0 && up[1] < 255);
});

test('shiftAlphaBoundary erodes and dilates binary masks symmetrically', () => {
  const mask = new Uint8Array(25);
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) {
      mask[y * 5 + x] = 255;
    }
  }
  const eroded = shiftAlphaBoundary(mask, 5, 5, -1);
  assert.equal(eroded[2 * 5 + 2], 255); // center survives 1px erosion
  assert.equal(eroded[1 * 5 + 1], 0);   // corner eroded

  const dilated = shiftAlphaBoundary(mask, 5, 5, 1);
  assert.equal(dilated[0], 255); // expanded to outer border
});

test('featherAlphaSeparable produces smooth intermediate alpha transitions', () => {
  const mask = new Uint8Array(25);
  for (let y = 2; y < 5; y++) {
    for (let x = 0; x < 5; x++) mask[y * 5 + x] = 255;
  }
  const feathered = featherAlphaSeparable(mask, 5, 5, 1);
  const boundaryVal = feathered[2 * 5 + 2];
  assert.ok(boundaryVal > 40 && boundaryVal < 245);
});

test('decontaminateForegroundColors replaces white halo RGB on semi-transparent boundary pixels', () => {
  // 3x1: [opaque crimson foreground] [50% alpha white-contaminated edge] [0% alpha background]
  const rgba = new Uint8ClampedArray([
    200, 20, 30, 255,
    240, 240, 240, 128,
    255, 255, 255, 0,
  ]);
  const alpha = new Uint8Array([255, 128, 0]);
  const clean = decontaminateForegroundColors(rgba, alpha, 3, 1, 2);
  // Boundary pixel red channel stays strong while green/blue white contamination drops sharply
  assert.ok(clean[4] > clean[5] + 40);
  assert.equal(clean[7], 128);
});

test('compositeNativeResolution exports both 32-bit RGBA and #FFFFFF flattened buffers', () => {
  const rgba = new Uint8ClampedArray([20, 100, 200, 255, 255, 255, 255, 255]);
  const alpha = new Uint8Array([255, 0]);

  const transparent = compositeNativeResolution(rgba, 2, 1, alpha, null);
  assert.equal(transparent[3], 255);
  assert.equal(transparent[7], 0);

  const whiteBg = compositeNativeResolution(rgba, 2, 1, alpha, [255, 255, 255]);
  assert.deepEqual(Array.from(whiteBg.slice(4, 8)), [255, 255, 255, 255]);
});

test('computeAlphaBoundingBox locates tight non-zero subject bounds', () => {
  const alpha = new Uint8Array(100);
  alpha[4 * 10 + 5] = 255;
  alpha[6 * 10 + 7] = 255;
  const box = computeAlphaBoundingBox(alpha, 10, 10, 10, 0);
  assert.equal(box.isEmpty, false);
  assert.deepEqual(box, { x: 5, y: 4, width: 3, height: 3, isEmpty: false });
});
