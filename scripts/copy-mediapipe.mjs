// Copies the MediaPipe Face Mesh runtime assets (WASM + protobuf data) out of
// node_modules into /public/mediapipe so they are served locally by Vite/Nginx
// rather than fetched from a CDN at runtime. This guarantees build stability
// and offline-capable, deterministic asset delivery.
//
// Runs automatically via `postinstall`, and explicitly inside the Docker build.

import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src = join(root, 'node_modules', '@mediapipe', 'face_mesh');
const dest = join(root, 'public', 'mediapipe');

if (!existsSync(src)) {
  console.warn(
    '[copy-mediapipe] @mediapipe/face_mesh not found in node_modules — ' +
      'skipping. Run `pnpm install` (or `npm install`) first.'
  );
  process.exit(0);
}

mkdirSync(dest, { recursive: true });

// Everything except the package manifest is a runtime asset MediaPipe may
// request via locateFile (.wasm, .data, .binarypb, .js, .tflite).
let copied = 0;
for (const file of readdirSync(src)) {
  if (file === 'package.json' || file === 'README.md' || file === 'LICENSE') continue;
  copyFileSync(join(src, file), join(dest, file));
  copied += 1;
}

console.log(`[copy-mediapipe] Vendored ${copied} asset(s) → public/mediapipe/`);
