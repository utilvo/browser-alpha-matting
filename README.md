# browser-alpha-matting

Zero-dependency JavaScript/TypeScript alpha-matting and mask-refinement kernel designed for **100% client-side image background removal** inside the browser—without uploading images to external servers.

## Architectural Motivation: Hybrid Browser-Side Segmentation

Serverless, browser-native background removal faces three engineering trade-offs when implemented with a single algorithm:

1. **4K Memory Bottlenecks in WebAssembly / WebGPU:** Running neural segmentation (such as `briaai/RMBG-1.4` via ONNX Runtime Web) directly on a 12 MP (`4000×3000`) tensor inside a browser tab allocates hundreds of megabytes of intermediate activation buffers, risking mobile Safari/Chrome tab eviction.
2. **Enclosed Typographic Counters (`O`, `A`, `B`, `P`):** Salient-object CNNs and ViTs optimize for outer object silhouettes; on flat vector logos or photographed ink signatures, neural masks frequently keep enclosed background pockets opaque (`alpha = 255`).
3. **Semi-Transparent Boundary Halos:** Pixels along hair strands and curved shoulders (`0 < alpha < 245`) store a linear blend of foreground color and studio background light (`C_obs = α·F + (1−α)·B`), producing bright white fringes when composited over dark surfaces.

`browser-alpha-matting` solves all three inside local browser `TypedArray` memory by **combining off-main-thread neural proxy masks with deterministic 3D Euclidean RGB color-keying, separable $O(W \cdot H)$ morphological refinement, foreground color decontamination, and native-resolution bilinear compositing**:

```text
Source RGBA (4000x3000 in Browser RAM)
 ├──► Downsampled 1024px Proxy ──► Web Worker (WebGPU / WASM RMBG-1.4) ──► Neural Mask (8-bit)
 ├──► Euclidean RGB Color-Key Pass (extractColorKeyAlpha) ───────────────► Counter Mask (8-bit)
 │                                                                              │
 │    ┌─────────────────────── fuseHybridAlpha() ◄──────────────────────────────┘
 │    ▼
 │  Bilinear Upsample to 4000x3000 (upsampleAlphaBilinear)
 │    ▼
 │  Separable O(W·H) Erosion/Dilation (shiftAlphaBoundary) + Tent Feather (featherAlphaSeparable)
 │    ▼
 └──► Foreground Color Decontamination (decontaminateForegroundColors) ──► 32-bit RGBA PNG / WebP
```

A full production browser implementation running this hybrid WebGPU `RMBG-1.4` + Color-Key pipeline can be tested directly in the browser at **[Utilvo Background Remover](https://utilvo.com/background-remover)**.

---

## Core Modules & Complexity

| Function | Time Complexity | Purpose |
| :--- | :--- | :--- |
| `extractColorKeyAlpha(rgba, w, h, opts)` | $O(W \cdot H)$ | 3D Euclidean RGB distance (`sqrt(dr² + dg² + db²)`) with `[tolerance, tolerance + softness]` anti-aliased ramp. |
| `fuseHybridAlpha(neural, colorKey, opts)` | $O(W \cdot H)$ | Preserves soft neural hair/fur contours while carving enclosed background counters (`O`, `A`, `B`, `P`) where `neural >= 200` and `colorKey < 64`. |
| `upsampleAlphaBilinear(proxy, pw, ph, tw, th)` | $O(W_{target} \cdot H_{target})$ | Pure `TypedArray` bilinear interpolation from `1024px` neural tensor output back to native `4K` dimensions. |
| `shiftAlphaBoundary(alpha, w, h, shiftPx)` | $O(W \cdot H \cdot |r|)$ | Two-pass separable 1D min/max morphological erosion (`shiftPx < 0`) and dilation (`shiftPx > 0`). |
| `featherAlphaSeparable(alpha, w, h, radiusPx)` | $O(W \cdot H)$ | Two-pass sliding-accumulator horizontal + vertical box blur (piecewise-linear tent kernel, independent of `radiusPx`). |
| `decontaminateForegroundColors(rgba, alpha, w, h)` | $O(k \cdot W \cdot H)$ | Propagates opaque foreground RGB outward into `0 < alpha < 245` edge pixels to remove white/chroma fringes. |
| `compositeNativeResolution(rgba, w, h, alpha, bg)` | $O(W \cdot H)$ | Exports lossless 32-bit transparent RGBA buffers or flattens onto exact `#FFFFFF` RGB backdrops. |
| `createMattingWorkerBridge(workerUrl)` | Zero-Copy IPC | `Transferable` `ArrayBuffer` Web Worker wrapper so WebGPU/WASM inference never blocks the 60 FPS main thread. |

---

## Quick Start (ES Modules / Browser / Node.js)

```javascript
import {
  extractColorKeyAlpha,
  fuseHybridAlpha,
  upsampleAlphaBilinear,
  shiftAlphaBoundary,
  featherAlphaSeparable,
  decontaminateForegroundColors,
} from './src/index.js';

// 1. Obtain 1024px neural alpha mask from an off-main-thread WebGPU/WASM worker
const nativeNeuralAlpha = upsampleAlphaBilinear(proxyNeuralAlpha, proxyW, proxyH, width, height);

// 2. Compute deterministic RGB color-key alpha to open enclosed logo/letter counters
const colorKeyAlpha = extractColorKeyAlpha(sourceRgba, width, height, {
  keyRgb: [255, 255, 255],
  tolerance: 28,
  softness: 16,
});

// 3. Fuse both masks in browser RAM
const fused = fuseHybridAlpha(nativeNeuralAlpha, colorKeyAlpha, {
  mode: 'neural-with-counters',
  interiorConfidence: 200,
});

// 4. Refine boundary (-1px choke + 2px separable feather) and purify edge colors
const choked = shiftAlphaBoundary(fused, width, height, -1);
const feathered = featherAlphaSeparable(choked, width, height, 2);
const cleanRgba = decontaminateForegroundColors(sourceRgba, feathered, width, height, 3);
```

---

## Running the Unit Test Suite

Requires Node.js 18+ (uses built-in `node:test` with zero external dependencies):

```bash
npm test
```

## License

MIT © Islam Ayoub
