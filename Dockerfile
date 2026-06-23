# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Builder: install with pnpm, copy local MediaPipe WASM, build bundle
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Enable the pnpm shipped with Corepack (deterministic, fast, disk-efficient).
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Leverage layer caching: dependency manifests first, source after.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod=false

# Copy the rest of the source tree.
COPY . .

# Vite's `postinstall` copy script may not have run if the lockfile changed
# without node_modules — run the MediaPipe asset sync explicitly, then build.
RUN node scripts/copy-mediapipe.mjs && pnpm build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Runtime: lightweight, hardened Nginx serving the static bundle
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# Drop the stock config in favour of our SPA + WASM-aware one.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/zuri.conf

# Static assets only — no Node runtime in the final image.
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Healthcheck keeps orchestrators honest about container readiness.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
