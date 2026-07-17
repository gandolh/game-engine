import { defineConfig } from "vite";

const base = process.env.HOLLOW_BASE ?? "/";

export default defineConfig({
  base,
  server: {
    // Farm uses 5173, Citadel uses 5174 — Hollow takes the next free port.
    // No server proxy: the sim runs entirely in an in-browser Web Worker
    // (see src/worker/sim-worker.ts), so there is nothing to proxy to yet.
    port: 5175,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
