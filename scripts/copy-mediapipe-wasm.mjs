// Copies MediaPipe's wasm runtime from node_modules into public/ so pose detection is served
// from this app (no third-party CDN) and always matches the installed @mediapipe/tasks-vision.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const target = path.join(root, "public/mediapipe/wasm");
// SIMD build plus the no-SIMD fallback that FilesetResolver picks on older browsers.
const files = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

mkdirSync(target, { recursive: true });

for (const file of files) {
  const from = path.join(source, file);
  const to = path.join(target, file);

  if (!existsSync(from)) {
    throw new Error(`Missing ${from}; run npm install`);
  }

  if (!existsSync(to) || statSync(to).size !== statSync(from).size || statSync(to).mtimeMs < statSync(from).mtimeMs) {
    copyFileSync(from, to);
  }
}
