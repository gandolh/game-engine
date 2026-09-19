import { defineConfig } from "vite";

const base = process.env.FARM_VALLEY_BASE ?? "/";

export default defineConfig({
  base,
  server: {
    port: 5173,

    proxy: {
      "/sim": {
        target: process.env.SIM_SERVER_URL ?? "ws://localhost:8787",
        ws: true,
        rewrite: (p) => p.replace(/^\/sim/, ""),
      },
    },
  },
  build: {
    // Tracks tsconfig.base.json's "target": "ES2022" — see corpus/wiki/decisions.md.
    target: "es2022",
    sourcemap: true,
  },
});
