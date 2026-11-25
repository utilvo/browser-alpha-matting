#!/usr/bin/env node
/**
 * CLI Benchmark Runner: Measures HD (1920x1080) and 4K UHD (3840x2160) throughput
 * across all browser-alpha-matting TypedArray stages.
 */
import { performance } from 'node:perf_hooks';
import {
  extractColorKeyAlpha,
  fuseHybridAlpha,
  upsampleAlphaBilinear,
  upsampleAlphaJointBilateral,
  featherAlphaSeparable,
  decontaminateForegroundColors,
} from '../src/index.js';

function benchStage(name, width, height, fn, iterations = 3) {
  fn(); // warm-up JIT
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const avgMs = (performance.now() - t0) / iterations;
  const mpPerSec = (((width * height) / 1e6) / (avgMs / 1000)).toFixed(1);
  console.log(`${name.padEnd(42)} | ${String(width + 'x' + height).padEnd(10)} | ${avgMs.toFixed(2).padStart(7)} ms | ${mpPerSec.padStart(7)} MP/s`);
  return { name, res: `${width}x${height}`, avgMs: Number(avgMs.toFixed(2)), mpPerSec: Number(mpPerSec) };
}

console.log('browser-alpha-matting v1.1.0 — TypedArray Kernel Throughput Benchmark');
console.log('-'.repeat(82));
console.log(`${'Kernel Stage'.padEnd(42)} | ${'Resolution'.padEnd(10)} | ${'Latency'.padStart(10)} | ${'Throughput'.padStart(12)}`);
console.log('-'.repeat(82));

const proxyW = 1024, proxyH = 1024;
const proxyMask = new Uint8Array(proxyW * proxyH);
for (let i = 0; i < proxyMask.length; i++) proxyMask[i] = i % 256;

for (const [w, h] of [[1920, 1080], [3840, 2160]]) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = (i * 17) & 255;
    rgba[i + 1] = (i * 31) & 255;
    rgba[i + 2] = (i * 47) & 255;
    rgba[i + 3] = 255;
  }

  let ckMask;
  let upMask;

  benchStage('extractColorKeyAlpha (Euclidean RGB)', w, h, () => {
    ckMask = extractColorKeyAlpha(rgba, w, h, { keyRgb: [255, 255, 255], tolerance: 30, softness: 18 });
  });

  benchStage('upsampleAlphaBilinear (1024px -> native)', w, h, () => {
    upMask = upsampleAlphaBilinear(proxyMask, proxyW, proxyH, w, h);
  });

  benchStage('upsampleAlphaJointBilateral (RGB-guided)', w, h, () => {
    upsampleAlphaJointBilateral(proxyMask, proxyW, proxyH, rgba, w, h, { sigmaColor: 28 });
  });

  benchStage('fuseHybridAlpha (neural + counters)', w, h, () => {
    fuseHybridAlpha(upMask, ckMask, { mode: 'neural-with-counters' });
  });

  benchStage('featherAlphaSeparable (radius = 3px)', w, h, () => {
    featherAlphaSeparable(upMask, w, h, 3);
  });

  benchStage('decontaminateForegroundColors (2 passes)', w, h, () => {
    decontaminateForegroundColors(rgba, upMask, w, h, 2);
  });
  console.log('-'.repeat(82));
}
