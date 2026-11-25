/**
 * browser-alpha-matting v1.1.0
 * Modular barrel entry point re-exporting all TypedArray matting, upsampling, morphology,
 * decontamination, perceptual Lab color-keying, and Transferable Web Worker primitives.
 *
 * @license MIT
 */

export * from './color-key.js';
export * from './hybrid-fusion.js';
export * from './upsample.js';
export * from './morphology.js';
export * from './decontaminate.js';
export * from './worker/bridge.js';
