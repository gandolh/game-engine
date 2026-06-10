import { defineConfig } from "vite";

// Deploy base path. Defaults to "/" for local dev; the deploy scripts set
// FARM_VALLEY_BASE=/farm-valley/ so all asset URLs are emitted under the subpath.
const base = process.env.FARM_VALLEY_BASE ?? "/";

export default defineConfig({
  base,
  server: {
    port: 5173,
    // Forward /sim WebSocket to the Node server on :8787 in dev (prod: Caddy proxies it).
    proxy: {
      "/sim": {
        target: process.env.SIM_SERVER_URL ?? "ws://localhost:8787",
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
