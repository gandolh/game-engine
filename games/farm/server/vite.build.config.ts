import { defineConfig } from "vite";

// The production build of the sim server: ONE ES module that plain `node` runs, so the container
// needs neither npm, nor tsx, nor a node_modules directory (see infrastructure/Dockerfile).
//
// A bundler rather than `tsc` emit, because every workspace package this server imports exports
// raw `.ts` (`"exports": "./src/*.ts"`) with extensionless relative imports — the repo bans `.js`
// suffixes (engine/core/src/conventions.test.ts) — and Node can load neither. Vite, because the
// clients already build with it and it resolves the engine's `*.glsl?raw` imports natively should
// the renderer ever become reachable from here (today it is not: create-renderer.ts loads it lazily
// and tree-shaking drops it).
//
// Deliberately NOT named vite.config.ts: `vitest run` would pick that up, and `ssr.noExternal`
// would then change how the light tests load `ws`.
export default defineConfig({
  // No `.env` loading: the server reads process.env at runtime, never import.meta.env.
  envDir: false,
  publicDir: false,
  build: {
    ssr: "src/index.ts",
    outDir: "dist",
    emptyOutDir: true,
    target: "node24",
    // Readable stack traces in the container's logs; the bundle is ~600 kB either way.
    minify: false,
    sourcemap: false,
    rolldownOptions: {
      // `.mjs`, so Node treats it as ESM without a package.json next to it in the image.
      output: { entryFileNames: "index.mjs" },
    },
  },
  // Inline `ws` too, so the runtime image ships no node_modules at all. Its optional native
  // add-ons (bufferutil, utf-8-validate) become stubs that throw inside ws's own try/catch,
  // and ws falls back to its pure-JS paths.
  ssr: { noExternal: true },
});
