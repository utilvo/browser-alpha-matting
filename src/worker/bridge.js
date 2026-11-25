/**
 * @module worker/bridge
 * Zero-copy Transferable ArrayBuffer Web Worker client wrapper.
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
        maskWidth: msg.maskWidth,
        maskHeight: msg.maskHeight,
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
