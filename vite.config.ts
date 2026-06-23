import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Local HTTPS is required: getUserMedia (the camera feed) only unlocks on a
// secure origin. basicSsl mints a self-signed cert so https://localhost works
// out of the box. In Docker we serve the production bundle over Nginx instead.
export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: true,
    strictPort: true,
    // Allows hot-module-reload to reach the browser when running inside the
    // dev container with a mapped volume.
    watch: {
      usePolling: true,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
  },
  // MediaPipe + the local WASM live under /public and are copied verbatim.
  publicDir: 'public',
});
