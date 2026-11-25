# Contributing to `browser-alpha-matting`

Contributions improving SIMD/TypedArray throughput, edge-guided upsampling, or WebGPU shader passes are welcome.

## Development Workflow

1. Requires **Node.js 20+** (zero `npm install` runtime dependencies).
2. Run the full test suite (`node:test`):
   ```bash
   npm test
   ```
3. Run the 1080p & 4K throughput benchmark suite:
   ```bash
   npm run bench
   ```

## Design Constraints

- **Zero Runtime Dependencies:** Core `src/*.js` modules must remain dependency-free ES modules compatible with browsers, Web Workers, Deno, Bun, and Node.js.
- **Bounded Heap Allocations:** Avoid per-pixel object allocations inside inner `width * height` loops; reuse flat `Uint8Array` / `Int32Array` buffers.
