import { defineConfig } from "vite";

const base = process.env.MATHQUEST_BASE ?? "/";

export default defineConfig({
  base,
  server: {
    // Farm uses 5173, Citadel uses 5174, Hollow uses 5175 — MateQuest takes
    // the next free port.
    // No server proxy: the sim runs entirely in an in-browser Web Worker
    // (see src/worker/sim-worker.ts), so there is nothing to proxy to yet.
    port: 5176,
  },
  build: {
    // Tracks tsconfig.base.json's "target": "ES2022" — see corpus/wiki/decisions.md.
    target: "es2022",
    sourcemap: true,
  },
});
