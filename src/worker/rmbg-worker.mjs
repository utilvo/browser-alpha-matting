/**
 * @module worker/rmbg-worker
 * Reference Dedicated Module Web Worker running briaai/RMBG-1.4 with WebGPU detection + WASM fallback.
 */

let modelPromise = null;
let selectedDevice = 'wasm';

async function loadPipeline() {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    const { AutoModel, AutoProcessor, RawImage, env } = await import(
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.2'
    );
    env.allowLocalModels = false;

    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) selectedDevice = 'webgpu';
      } catch {
        selectedDevice = 'wasm';
      }
    }

    const model = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
      device: selectedDevice,
      dtype: selectedDevice === 'webgpu' ? 'fp32' : 'q8',
      config: { model_type: 'custom' },
    });

    const processor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
      config: {
        do_normalize: true,
        do_pad: false,
        do_rescale: true,
        do_resize: true,
        image_mean: [0.5, 0.5, 0.5],
        feature_extractor_type: 'ImageFeatureExtractor',
        image_std: [1, 1, 1],
        resample: 2,
        rescale_factor: 0.00392156862745098,
        size: { width: 1024, height: 1024 },
      },
    });

    return { model, processor, RawImage };
  })();
  return modelPromise;
}

self.onmessage = async (event) => {
  const { id, type, rgbaBuffer, width, height } = event.data || {};
  if (type !== 'segment') return;

  try {
    const { model, processor, RawImage } = await loadPipeline();
    const rgba = new Uint8ClampedArray(rgbaBuffer);
    const image = new RawImage(rgba, width, height, 4);

    const { pixel_values } = await processor(image);
    const { output } = await model({ input: pixel_values });
    const tensor = output[0];
    const dims = tensor.dims;
    const mh = dims[dims.length - 2];
    const mw = dims[dims.length - 1];
    const raw = tensor.data;

    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] < minV) minV = raw[i];
      if (raw[i] > maxV) maxV = raw[i];
    }
    const span = maxV - minV || 1;
    const alpha = new Uint8Array(mw * mh);
    for (let i = 0; i < alpha.length; i++) {
      alpha[i] = Math.round(((raw[i] - minV) / span) * 255);
    }

    self.postMessage(
      { id, alphaBuffer: alpha.buffer, maskWidth: mw, maskHeight: mh, device: selectedDevice },
      [alpha.buffer]
    );
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) });
  }
};
