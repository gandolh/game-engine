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
    target: "esnext",
    sourcemap: true,
  },
});
