import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rgbToLab,
  extractPerceptualLabAlpha,
  detectEnclosedCounters,
  upsampleAlphaJointBilateral,
} from '../src/index.js';

test('rgbToLab maps pure white to L~100 and pure black to L~0', () => {
  const [wL, wa, wb] = rgbToLab(255, 255, 255);
  const [bL] = rgbToLab(0, 0, 0);
  assert.ok(Math.abs(wL - 100) < 0.2);
  assert.ok(Math.abs(wa) < 0.5 && Math.abs(wb) < 0.5);
  assert.ok(Math.abs(bL) < 0.2);
});

test('extractPerceptualLabAlpha isolates ink strokes against off-white paper tint', () => {
  // Pixel 0: warm paper (252, 250, 246), Pixel 1: dark blue pen ink (18, 35, 130)
  const rgba = new Uint8ClampedArray([
    252, 250, 246, 255,
    18, 35, 130, 255,
  ]);
  const alpha = extractPerceptualLabAlpha(rgba, 2, 1, {
    keyRgb: [255, 255, 255],
    deltaETolerance: 8,
    deltaESoftness: 6,
  });
  assert.equal(alpha[0], 0);
  assert.equal(alpha[1], 255);
});

test('detectEnclosedCounters separates interior glyph holes from border-connected background', () => {
  // 5x5 grid: outer ring (border) is background (alpha=0), 3x3 ring is foreground (alpha=255), center (2,2) is enclosed hole (alpha=0)
  const ck = new Uint8Array(25);
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) {
      ck[y * 5 + x] = 255;
    }
  }
  ck[2 * 5 + 2] = 0; // enclosed 'O' counter

  const holes = detectEnclosedCounters(ck, 5, 5, 32);
  assert.equal(holes[0], 0);         // exterior border background is NOT marked as enclosed counter
  assert.equal(holes[1 * 5 + 1], 0); // opaque foreground stroke is 0
  assert.equal(holes[2 * 5 + 2], 255); // center enclosed counter IS detected as 255
});

test('upsampleAlphaJointBilateral snaps ambiguous transition pixels toward matching RGB guide side', () => {
  // 2x1 proxy: [0, 255] -> upsampled to 4x1
  const proxy = new Uint8Array([0, 255]);
  // Guide 4x1: pixels 0,1,2 are pure black (0,0,0), pixel 3 is bright yellow (250,240,20)
  const guide = new Uint8ClampedArray([
    0, 0, 0, 255,
    0, 0, 0, 255,
    0, 0, 0, 255,
    250, 240, 20, 255,
  ]);
  const jb = upsampleAlphaJointBilateral(proxy, 2, 1, guide, 4, 1, { sigmaColor: 15 });
  // Pixel 2 matches left black guide strongly -> pulled sharply toward 0 compared to naive bilinear (191)
  assert.ok(jb[2] < 40, `Expected edge-snapped alpha < 40, got ${jb[2]}`);
  assert.equal(jb[3], 255);
});
