import { defineConfig } from "vite";

// Deploy base path. Defaults to "/" for local dev; the deploy scripts set
// FARM_VALLEY_BASE=/farm-valley/ so all asset URLs are emitted under the subpath.
const base = process.env.FARM_VALLEY_BASE ?? "/";

export default defineConfig({
  base,
  server: { port: 5173 },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
