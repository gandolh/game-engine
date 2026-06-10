import { defineConfig } from "vite";

// Deploy base path. Defaults to "/" for local dev; the deploy scripts set
// FARM_VALLEY_BASE=/farm-valley/ so all asset URLs are emitted under the subpath.
const base = process.env.FARM_VALLEY_BASE ?? "/";

export default defineConfig({
  base,
  server: {
    port: 5173,
    // Forward the sim WebSocket to the Node server (brief 58). In dev `base` is
    // "/", so the client connects to ws://localhost:5173/sim; Vite proxies that
    // to the server on :8787. In prod Caddy reverse-proxies /farm-valley/sim
    // instead (Vite is not in the path). `npm run dev` starts both this and the
    // server together (see the root dev script).
    proxy: {
      "/sim": {
        target: process.env.SIM_SERVER_URL ?? "ws://localhost:8787",
        ws: true,
        // The server listens at its root ("/"), not "/sim" — strip the prefix.
        rewrite: (p) => p.replace(/^\/sim/, ""),
      },
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
