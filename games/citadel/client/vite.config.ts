import { defineConfig } from "vite";

const base = process.env.CITADEL_BASE ?? "/";

export default defineConfig({
  base,
  server: {
    port: 5174,
    proxy: {
      // Citadel 35: `?mp` drives the sim over WS to @citadel/server (port 8788).
      "/sim": {
        target: process.env.CITADEL_SIM_SERVER_URL ?? "ws://localhost:8788",
        ws: true,
        rewrite: (p) => p.replace(/^\/sim/, ""),
      },
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
