/**
 * Browser Pipeline Example: Off-Main-Thread WebGPU RMBG-1.4 + Hybrid Counter Matting
 */
import {
  createMattingWorkerBridge,
  extractColorKeyAlpha,
  fuseHybridAlpha,
  upsampleAlphaJointBilateral,
  featherAlphaSeparable,
  decontaminateForegroundColors,
} from '../src/index.js';

export async function removeBackgroundInBrowser(imageElement, workerScriptUrl = '/workers/rmbg-worker.mjs') {
  const width = imageElement.naturalWidth;
  const height = imageElement.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageElement, 0, 0);
  const srcData = ctx.getImageData(0, 0, width, height);

  // 1. Run neural saliency on a downsampled <= 1024px proxy inside Web Worker
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const pw = Math.round(width * scale);
  const ph = Math.round(height * scale);
  const proxyCanvas = document.createElement('canvas');
  proxyCanvas.width = pw;
  proxyCanvas.height = ph;
  const pctx = proxyCanvas.getContext('2d');
  pctx.drawImage(imageElement, 0, 0, pw, ph);
  const proxyRgba = pctx.getImageData(0, 0, pw, ph).data;

  const bridge = createMattingWorkerBridge(workerScriptUrl);
  try {
    const { alpha: proxyAlpha, maskWidth, maskHeight, device } = await bridge.segmentRgba(proxyRgba, pw, ph);

    // 2. RGB-guided Joint Bilateral upsampling to native camera pixels
    const nativeNeural = upsampleAlphaJointBilateral(
      proxyAlpha,
      maskWidth || pw,
      maskHeight || ph,
      srcData.data,
      width,
      height,
      { sigmaColor: 26 }
    );

    // 3. Fuse with Euclidean RGB color-keying to open enclosed glyph/handle counters
    const colorKey = extractColorKeyAlpha(srcData.data, width, height, {
      keyRgb: [255, 255, 255],
      tolerance: 26,
      softness: 16,
    });
    const fused = fuseHybridAlpha(nativeNeural, colorKey, { mode: 'neural-with-counters' });

    // 4. Smooth boundary & purify semi-transparent edge colors
    const feathered = featherAlphaSeparable(fused, width, height, 1);
    const cleanPixels = decontaminateForegroundColors(srcData.data, feathered, width, height, 3);

    ctx.putImageData(new ImageData(cleanPixels, width, height), 0, 0);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    return { blob, width, height, device };
  } finally {
    bridge.terminate();
  }
}
