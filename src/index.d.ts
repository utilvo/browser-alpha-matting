export interface ColorKeyOptions {
  keyRgb?: [number, number, number];
  tolerance?: number;
  softness?: number;
}

export interface HybridFusionOptions {
  mode?: 'neural-with-counters' | 'min' | 'max';
  interiorConfidence?: number;
}

export interface AlphaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  isEmpty: boolean;
}

export interface MattingWorkerBridge {
  segmentRgba(
    rgba: Uint8ClampedArray,
    width: number,
    height: number
  ): Promise<{ alpha: Uint8Array; device: string }>;
  terminate(): void;
}

export declare function extractColorKeyAlpha(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options?: ColorKeyOptions
): Uint8Array;

export declare function fuseHybridAlpha(
  neuralAlpha: Uint8Array,
  colorKeyAlpha: Uint8Array,
  options?: HybridFusionOptions
): Uint8Array;

export declare function upsampleAlphaBilinear(
  proxyAlpha: Uint8Array,
  proxyW: number,
  proxyH: number,
  targetW: number,
  targetH: number
): Uint8Array;

export declare function shiftAlphaBoundary(
  alpha: Uint8Array,
  width: number,
  height: number,
  shiftPx: number
): Uint8Array;

export declare function featherAlphaSeparable(
  alpha: Uint8Array,
  width: number,
  height: number,
  radiusPx: number
): Uint8Array;

export declare function decontaminateForegroundColors(
  rgba: Uint8Array | Uint8ClampedArray,
  alpha: Uint8Array,
  width: number,
  height: number,
  passes?: number
): Uint8ClampedArray;

export declare function compositeNativeResolution(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  alpha: Uint8Array,
  backdropRgb?: [number, number, number] | null
): Uint8ClampedArray;

export declare function computeAlphaBoundingBox(
  alpha: Uint8Array,
  width: number,
  height: number,
  threshold?: number,
  paddingRatio?: number
): AlphaBoundingBox;

export declare function createMattingWorkerBridge(
  workerUrl: string | URL
): MattingWorkerBridge;
