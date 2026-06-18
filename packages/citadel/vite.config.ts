import { defineConfig } from "vite";

const base = process.env.CITADEL_BASE ?? "/";

export default defineConfig({
  base,
  server: {
    port: 5174,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
