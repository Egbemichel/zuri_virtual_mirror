# Zuri Virtual Mirror

A high-fidelity, containerized **photo lip try-on**. Capture a selfie, choose a
premium lip *Combo* (liner + gloss) — or blend your own — and layer an optional
**Clear Gloss** for a wet-look shine. The chosen shade is composited onto your
captured photo with a custom WebGL2 shader (Fresnel-Schlick specular, subsurface
scattering, head-reactive micro-twinkle glitter) over a MediaPipe face mesh, then
exported as a shareable PNG.

> **Capture & render**, not generative AI: only the lips are repainted — every
> other pixel of you stays authentic. Quiet-luxury aesthetic · brand accents
> `#f9ad99` & `#e68c58` · runs fully on-device — **no photo ever leaves the
> browser.**

### Why a photo flow (not live AR or AI generation)?

- **Identity fidelity** — a deterministic shader changes *only* the lips, so the
  preview is a faithful product try-on. Generative models subtly warp the face.
- **On-device & private** — capture → detect → render takes ~1s locally; nothing
  is uploaded, no per-image cloud cost.
- **Try shades instantly** — after one capture, switching combos / toggling the
  Clear Gloss re-renders on the stored photo with zero re-capture.

---

## Architecture at a glance

| Layer            | Tech                                                              |
| ---------------- | ---------------------------------------------------------------- |
| Build engine     | Vite + TypeScript (local HTTPS for camera access)                |
| Graphics         | Three.js, WebGL2, `#version 300 es` `RawShaderMaterial`           |
| Face detection   | MediaPipe Face Mesh via **global CDN `<script>` tags** (no bundling), one-shot on the captured still, `refineLandmarks: true`, **local WASM** under `/public/mediapipe` |
| UI               | Framework-free TypeScript DOM + a quiet-luxury CSS design system  |
| Delivery         | Multi-stage Docker (pnpm build → `nginx:alpine` static serve)     |

### Project tree

```
zuri_virtual_mirror/
├── public/
│   ├── fonts/                 # brand woff2 (Rische, IsidoraSans) — see README
│   └── mediapipe/             # WASM/protobuf, vendored from node_modules
├── scripts/
│   └── copy-mediapipe.mjs     # syncs MediaPipe assets → public/mediapipe
├── src/
│   ├── components/
│   │   └── ComboPicker.ts     # quiet-luxury control panel
│   ├── data/
│   │   └── combos.ts          # the curated Combo library
│   ├── App.ts                 # capture→detect→render flow, controls, download
│   ├── CameraPreview.ts       # getUserMedia framing + mirrored still capture
│   ├── FaceMeshTracker.ts     # FaceMeshDetector: one-shot, window-scoped, local WASM
│   ├── LipGeometry.ts         # landmark → triangulated lip ring mesh (smoothed)
│   ├── LipShader.ts           # GLSL3 vertex + fragment (SSS, twinkle, gloss, photo composite)
│   ├── SceneManager.ts        # renderer, photo background, lip overlay, PNG export
│   ├── main.ts                # entry point
│   ├── style.css              # design system
│   └── vite-env.d.ts          # MediaPipe global type declarations
├── index.html                 # CDN script tags + camera stage hooks
├── vite.config.ts             # local HTTPS dev server
├── Dockerfile                 # multi-stage: pnpm build → nginx:alpine
├── docker-compose.yml         # `dev` (HMR) and `web` (prod) services
├── nginx.conf                 # SPA + WASM MIME + hardening headers
├── tsconfig.json
└── package.json
```

---

## Developer workflow

You can run the mirror **two ways**. Use **Local dev** for the fastest inner
loop; use **Docker dev** if you prefer a clean, reproducible container. Either
way the camera requires a **secure origin** (HTTPS or `localhost`).

### Option A — Local (fastest)

```powershell
# 1. Install dependencies (also vendors the MediaPipe WASM via postinstall)
npm install

# 2. Launch the HTTPS dev server
npm run dev
```

Open **https://localhost:5173**. The dev cert is self-signed, so Chrome shows a
warning the first time → click **Advanced → Proceed to localhost (unsafe)**.
Grant the camera permission when prompted.

### Option B — Docker dev container (live reload)

The `dev` service bind-mounts your source for instant HMR.

```powershell
# From the project root in PowerShell:
docker compose up dev
```

This installs deps inside the container, vendors the MediaPipe WASM, and starts
Vite on port **5173**. Then browse to **https://localhost:5173**.

> Edit any file on the host → the container rebuilds and the browser hot-reloads.

### Option C — Production image (Nginx)

Build the optimized multi-stage image and serve the static bundle:

```powershell
docker compose up --build web
```

Browse to **http://localhost:8080**.

> ⚠️ The production service serves over **HTTP** on `localhost`, which Chrome
> still treats as a secure context, so the camera works. If you expose it on a
> LAN IP or domain, terminate **HTTPS** in front of Nginx (camera APIs require
> it on non-localhost origins).

---

## Testing the try-on (Chrome)

1. Start one of the options above and open the URL in **Google Chrome**.
2. Accept the self-signed cert (Option A) and **Allow** camera access.
3. **Hard refresh** to guarantee the latest bundle + a clean MediaPipe init:
   - Windows: **`Ctrl + Shift + R`**, or open DevTools (`F12`) → right-click the
     reload button → **Empty Cache and Hard Reload**.
4. Frame your face in the live preview, then click **Capture**.
5. The face mesh runs on the still and your lips are repainted with the active
   combo over the captured photo.
6. Click any **Combo** swatch — the shade re-renders on the photo instantly (no
   re-capture). Blend a **Custom** shade with the colour pickers if you like.
7. Flip the **Clear Gloss Layer** switch to add the wet-look shine on top, and
   watch the **micro-twinkle** glitter animate live in the result.
8. Click **Download** to save the composited PNG, or **Retake** to shoot again.

### If the camera doesn't appear

- Confirm the page is on **https://localhost** or **http://localhost** (not a
  raw IP) — `getUserMedia` is blocked otherwise.
- Check `chrome://settings/content/camera` — make sure the site isn't blocked
  and the correct device is selected.
- Open DevTools → **Console**; a `MediaPipe FaceMesh global not found` error
  means the CDN `<script>` tags were blocked (ad-blocker / offline). The WASM is
  local, but the loader scripts come from jsDelivr in `index.html`.
- If lips don't render, verify `public/mediapipe/` is populated
  (`node scripts/copy-mediapipe.mjs`).

---

## Shader notes

`src/LipShader.ts` is a WebGL2 (`#version 300 es`) `RawShaderMaterial`:

- **Subsurface scattering** — warm under-glow tint `vec3(1.25, 0.7, 0.6)` blended
  at grazing angles to fake light bleeding through lip tissue.
- **Micro-twinkle shimmer** — a 512² noise field (generated at runtime) sampled
  with the lookup UV offset by the **view-space normal** (`normal.xy * 0.1`) and
  animated by `uTime`, so individual flecks blink as the head rotates.
- **Lip-liner mapping** — a secondary Fresnel layer feathered from the outer
  boundary (landmarks **61–291**, `uv.y → 0`) inward over the gloss fill.
- **Clear-gloss toggle** — `uIsClearGloss` forces roughness → 0, boosts env
  reflection ×1.5, and amplifies rim alpha for a hyper-reflective finish.

The 512² noise and the equirectangular "studio HDR" environment are both
synthesized procedurally in `SceneManager.ts`, so the repo stays self-contained
(no binary texture assets required to run).
