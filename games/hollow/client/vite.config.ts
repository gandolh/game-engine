import { defineConfig, type UserConfig } from "vite";

const base = process.env.HOLLOW_BASE ?? "/";

const page: UserConfig = {
  base,
  server: {
    // Farm uses 5173, Citadel uses 5174 — Hollow takes the next free port.
    // No server proxy: the sim runs entirely in an in-browser Web Worker
    // (see src/worker/sim-worker.ts), so there is nothing to proxy to yet.
    port: 5175,
  },
  build: {
    // Tracks tsconfig.base.json's "target": "ES2022" — see corpus/wiki/decisions.md.
    target: "es2022",
    sourcemap: true,
  },
};

/**
 * `npm run build:os` (`vite build --mode os`): the ImbatranimOS marketplace
 * module. One ES module, `dist/os/hollow.mjs`, exporting `mount`/`unmount`
 * (`src/os-entry.ts`), with the sim worker and any chunks beside it. Under
 * `dist/` so it is gitignored and skipped by the engine's source-scanning
 * guard tests like any other build output; `npm run build` empties `dist/`,
 * this empties only `dist/os/`. The
 * desktop serves only this directory, under its own origin and an unknown
 * path, so everything loads relative to the module: the worker through
 * `new URL(..., import.meta.url)`, and the stylesheet is inlined into the JS.
 */
const os: UserConfig = {
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
    outDir: "dist/os",
    emptyOutDir: true,
    lib: {
      entry: "src/os-entry.ts",
      formats: ["es"],
      fileName: () => "hollow.mjs",
    },
  },
  // The worker imports modules, so it is built as an ES module worker, as
  // `mount.ts` constructs it (`{ type: "module" }`).
  worker: { format: "es" },
};

export default defineConfig(({ mode }) => (mode === "os" ? os : page));
