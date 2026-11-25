# Changelog

All notable changes to `browser-alpha-matting` are documented in this file.

## [1.1.0] - 2026-11-25

### Added
- Modular sub-engine split (`src/color-key.js`, `src/hybrid-fusion.js`, `src/upsample.js`, `src/morphology.js`, `src/decontaminate.js`, `src/worker/bridge.js`, `src/worker/rmbg-worker.mjs`).
- `rgbToLab` and `extractPerceptualLabAlpha` for CIE76 $\Delta E$ perceptual L\*a\*b\* color-keying on unevenly lit paper scans.
- `detectEnclosedCounters` non-recursive BFS flood-fill analyzer separating interior glyph holes (`O`, `A`, `B`, `P`) from border-connected backgrounds.
- `upsampleAlphaJointBilateral` RGB-guided edge-preserving 4K proxy-mask upsampler.
- Automated 1080p & 4K UHD throughput benchmark runner (`benchmarks/run-benchmarks.mjs`), runnable examples (`examples/`), and GitHub Actions CI matrix (`.github/workflows/ci.yml`).
- Live `@huggingface/transformers` `briaai/RMBG-1.4` WebGPU/WASM inference integrated into the GitHub Pages interactive sandbox (`docs/index.html`).

## [1.0.0] - 2026-11-25

### Added
- Initial release of `extractColorKeyAlpha`, `fuseHybridAlpha`, `upsampleAlphaBilinear`, `shiftAlphaBoundary`, `featherAlphaSeparable`, `decontaminateForegroundColors`, `compositeNativeResolution`, `computeAlphaBoundingBox`, and `createMattingWorkerBridge`.
