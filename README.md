# browser-alpha-matting

[![CI](https://github.com/utilvo/browser-alpha-matting/actions/workflows/ci.yml/badge.svg)](https://github.com/utilvo/browser-alpha-matting/actions/workflows/ci.yml)
[![Live GitHub Pages Demo](https://img.shields.io/badge/Live_GitHub_Pages_Demo-WebGPU_RMBG--1.4-16a34a?logo=github)](https://utilvo.github.io/browser-alpha-matting/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/utilvo/browser-alpha-matting/blob/main/LICENSE)

Zero-dependency JavaScript & TypeScript computer-vision SDK for **100% client-side image background removal** inside browser memory—combining off-main-thread WebGPU/WebAssembly neural saliency masks (`briaai/RMBG-1.4`) with Euclidean sRGB & perceptual CIE76 $L^*a^*b^*$ color-keying, edge-guided Joint Bilateral 4K upsampling, separable $O(W \cdot H)$ morphology, and iterative foreground color decontamination.

### Live Interactive Demos

- **GitHub Pages Kernel & Live WebGPU `RMBG-1.4` Sandbox:** **[https://utilvo.github.io/browser-alpha-matting/](https://utilvo.github.io/browser-alpha-matting/)** *(upload any photo directly on GitHub Pages to run `briaai/RMBG-1.4` + Hybrid Counter Matting in your browser)*
- **Full Production Studio Reference (Brush, Batch ZIP, Backdrops):** **[https://utilvo.com/background-remover](https://utilvo.com/background-remover)**

---

## Repository Structure

```text
browser-alpha-matting/
├── .github/workflows/
│   └── ci.yml                       # Node.js 20.x & 22.x unit test + 4K benchmark CI matrix
├── benchmarks/
│   └── run-benchmarks.mjs           # Automated 1080p & 4K UHD throughput benchmark runner
├── docs/
│   ├── index.html                   # Live GitHub Pages WebGPU RMBG-1.4 + Hybrid Matting app
│   └── index.js                     # Browser-ready ESM bundle for GitHub Pages
├── examples/
│   ├── logo-counter-carving.mjs     # Runnable Node.js BFS counter-detection & Lab demo
│   └── webgpu-worker-pipeline.js    # Complete HTML5 Canvas + Transferable Worker pipeline
├── src/
│   ├── worker/
│   │   ├── bridge.js                # Zero-copy Transferable ArrayBuffer Web Worker bridge
│   │   └── rmbg-worker.mjs          # Dedicated WebGPU / WASM briaai/RMBG-1.4 worker module
│   ├── color-key.js                 # Euclidean sRGB & CIE76 L*a*b* perceptual color-keying
│   ├── decontaminate.js             # 8-connected foreground RGB halo purification & compositing
│   ├── hybrid-fusion.js             # Neural + Color-Key fusion & BFS enclosed-counter detector
│   ├── index.d.ts                   # Strict TypeScript declarations for all 12 exports
│   ├── index.js                     # Modular ESM barrel entry point
│   ├── morphology.js                # Separable O(W*H) erosion/dilation, tent blur & bbox trim
│   └── upsample.js                  # Bilinear & RGB-guided Joint Bilateral 4K upsamplers
├── test/
│   ├── advanced-kernels.test.mjs    # CIE Lab, BFS counter-carving & Joint Bilateral tests
│   └── matting.test.mjs             # Core color-key, morphology, feather & decontamination tests
├── .zenodo.json                     # Academic archival metadata (ORCID 0009-0002-1503-5639)
├── CHANGELOG.md                     # Release history (v1.0.0 -> v1.1.0)
├── CITATION.cff                     # GitHub / DataCite software citation manifest
├── CONTRIBUTING.md                  # Zero-allocation TypedArray engineering guidelines
├── jsr.json                         # Deno / JSR package manifest (@utilvo/browser-alpha-matting)
├── LICENSE                          # MIT License
├── mod.ts                           # Deno / TypeScript native entry point
├── package.json                     # Node.js / npm ESM package & CLI benchmark entry
├── SECURITY.md                      # Zero-network-egress threat model & CSP configuration
└── tsconfig.json                    # Strict ES2022 TypeScript configuration
```

---

## Architectural Motivation: Hybrid Browser-Side Segmentation

Executing full-resolution background removal inside a browser tab without server uploads exposes three failure modes when relying on a single algorithm:

1. **4K Activation Memory Exhaustion:** Passing a raw 12 MP (`4000×3000`) image tensor into an in-browser ONNX graph allocates hundreds of megabytes of intermediate `Float32` activations, triggering mobile tab crashes.
2. **Opaque Interior Typographic Counters (`O`, `A`, `B`, `P`):** Salient-object CNNs optimize for outer silhouettes; on flat logos or scanned ink signatures, enclosed background pockets inside glyphs frequently remain opaque (`alpha = 255`).
3. **Semi-Transparent Boundary Halos (`0 < α < 245`):** Edge pixels store a linear mixture of foreground color $F$ and background illumination $B$ ($C_{\text{obs}} = \alpha F + (1 - \alpha)B$), leaving bright white fringes on dark surfaces.

`browser-alpha-matting` decouples proxy neural inference from native 4K `TypedArray` compositing:

```text
Source RGBA (3840x2160 in Browser RAM)
 ├──► Downsampled 1024px Proxy ──► Web Worker (WebGPU / WASM RMBG-1.4) ──► Proxy Alpha (8-bit)
 ├──► sRGB / CIE76 Lab Color-Key + BFS Counter Analyzer ─────────────────► Counter Mask (8-bit)
 │                                                                              │
 │    ┌── upsampleAlphaJointBilateral() + fuseHybridAlpha() ◄───────────────────┘
 │    ▼
 │  Separable O(W·H) Erosion/Dilation (shiftAlphaBoundary) + Tent Blur (featherAlphaSeparable)
 │    ▼
 └──► Foreground Color Decontamination (decontaminateForegroundColors) ──► 32-bit RGBA PNG / WebP
```

---

## Measured Throughput Benchmarks (Node.js v22, Single Thread)

Reproduce locally via `npm run bench`:

| Kernel Stage | 1080p (`1920×1080`) | 4K UHD (`3840×2160`) | Throughput |
| :--- | ---: | ---: | ---: |
| `fuseHybridAlpha` (`neural-with-counters`) | `5.5 ms` | `21.8 ms` | `~376 MP/s` |
| `extractColorKeyAlpha` (3D Euclidean sRGB) | `11.9 ms` | `40.9 ms` | `~202 MP/s` |
| `upsampleAlphaBilinear` (`1024px -> native`) | `16.9 ms` | `59.1 ms` | `~140 MP/s` |
| `featherAlphaSeparable` (`radius = 3px`, $O(W \cdot H)$) | `35.1 ms` | `141.0 ms` | `~59 MP/s` |
| `decontaminateForegroundColors` (`2` 8-connected rings) | `72.9 ms` | `290.0 ms` | `~28 MP/s` |

---

## API Overview

| Module | Exported Functions | Description |
| :--- | :--- | :--- |
| `src/color-key.js` | `extractColorKeyAlpha`, `extractPerceptualLabAlpha`, `rgbToLab` | 3D Euclidean sRGB and CIE76 $\Delta E$ perceptual $L^*a^*b^*$ backdrop alpha extraction. |
| `src/hybrid-fusion.js` | `fuseHybridAlpha`, `detectEnclosedCounters` | Dual-engine neural + color-key combiner and non-recursive BFS enclosed-hole detector. |
| `src/upsample.js` | `upsampleAlphaBilinear`, `upsampleAlphaJointBilateral` | Bilinear and RGB-guided edge-snapping 4K proxy-mask upsamplers. |
| `src/morphology.js` | `shiftAlphaBoundary`, `featherAlphaSeparable`, `computeAlphaBoundingBox` | Separable 1D min/max erosion/dilation, sliding-accumulator tent feathering, and tight auto-trim bounds. |
| `src/decontaminate.js` | `decontaminateForegroundColors`, `compositeNativeResolution` | Outward foreground RGB propagation into `0 < alpha < 245` edges and 32-bit RGBA / `#FFFFFF` compositing. |
| `src/worker/*` | `createMattingWorkerBridge`, `rmbg-worker.mjs` | Zero-copy `Transferable` `ArrayBuffer` Web Worker client and reference `briaai/RMBG-1.4` WebGPU/WASM worker. |

---

## Quick Start

```javascript
import {
  extractPerceptualLabAlpha,
  fuseHybridAlpha,
  upsampleAlphaJointBilateral,
  shiftAlphaBoundary,
  featherAlphaSeparable,
  decontaminateForegroundColors,
} from 'browser-alpha-matting';

// 1. Edge-guided upsample of 1024px WebGPU worker mask onto native 4K RGBA pixels
const nativeNeural = upsampleAlphaJointBilateral(
  proxyNeuralAlpha, 1024, 1024, sourceRgba, width, height, { sigmaColor: 26 }
);

// 2. Perceptual CIE Lab color-key pass to carve enclosed counters (O, A, B, P)
const labAlpha = extractPerceptualLabAlpha(sourceRgba, width, height, {
  keyRgb: [255, 255, 255],
  deltaETolerance: 10,
});

// 3. Fuse, refine boundary, and purify semi-transparent edge colors
const fused = fuseHybridAlpha(nativeNeural, labAlpha, { mode: 'neural-with-counters' });
const feathered = featherAlphaSeparable(shiftAlphaBoundary(fused, width, height, -1), width, height, 2);
const cleanRgba = decontaminateForegroundColors(sourceRgba, feathered, width, height, 3);
```

## Running Tests & Benchmarks

```bash
npm test
npm run bench
node examples/logo-counter-carving.mjs
```

## License

MIT © Islam Ayoub
