# Security & Zero-Egress Threat Model

`browser-alpha-matting` executes 100% inside the caller's JavaScript engine (`Uint8Array` / `Uint8ClampedArray` linear memory and HTML5 Canvas / Web Workers).

## Verifying Zero Image Network Egress

1. **Core Kernel (`src/*.js`):** Contains zero `fetch()`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, or dynamic external script imports.
2. **Reference Web Worker (`src/worker/rmbg-worker.mjs`):** Performs read-only `GET` requests solely to download and cache static model weights (`briaai/RMBG-1.4`) on first initialization; image `ArrayBuffer` payloads never leave local thread memory.
3. **Recommended Content Security Policy (CSP) for Host Applications:**
   Restrict `connect-src` only to the static ONNX/WASM weight origin (or `'self'` when self-hosting `.onnx` weights) so browser sandbox policy makes outbound image exfiltration structurally impossible.

## Reporting Vulnerabilities

Report security issues privately to `info@utilvo.com`.
