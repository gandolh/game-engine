# library-consumer

Out-of-workspace acceptance fixture for the three packable `@engine/*` libraries
(`@engine/core`, `@engine/ui`, `@engine/wasm-modules`). This directory is **outside** the root
`package.json` workspaces globs (`engine/*`, `games/*/*`, `tools/*`) on purpose — it gets its
own `node_modules`, installed from real `npm pack` tarballs via `file:`, so it can prove the
packages work for someone who is NOT inside this monorepo.

## Important: tarballs are gitignored

`tarballs/` and `node_modules/` are gitignored (build artifacts). `package.json` and
`package-lock.json` ARE committed for reproducibility, but their `file:./tarballs/...`
dependencies **dangle** until you regenerate the tarballs locally — `npm install` will fail
with an ENOENT on a fresh checkout until you run step 1 below.

## Regenerate and run

From the repo root:

```bash
# 1. Build + pack all three engine packages into this fixture's tarballs/ dir.
#    (prepack builds dist/ and swaps the manifest to dist-pointing exports;
#    postpack restores the dev manifest — the working tree ends up unchanged.)
npm pack --prefix engine/core            --pack-destination examples/library-consumer/tarballs
npm pack --prefix engine/ui              --pack-destination examples/library-consumer/tarballs
npm pack --prefix engine/wasm-modules    --pack-destination examples/library-consumer/tarballs

# (equivalently, from inside each package dir: npm pack --pack-destination <abs path to tarballs>)

# 2. Install the fixture's own node_modules from those tarballs.
cd examples/library-consumer
npm install

# 3. Run the smoke.
npm run smoke   # or: node smoke.mjs
```

Expect tarballs named `engine-core-0.1.0.tgz`, `engine-ui-0.1.0.tgz`,
`engine-wasm-modules-0.1.0.tgz`. All three must be present and installed together —
`@engine/ui` depends on `@engine/core@0.1.0` and must resolve it from this fixture's sibling
install, not the npm registry (the package has never been published there and would 404).

## What the smoke checks

- `smoke-isolation.mjs` — resolves each package's entry point via `import.meta.resolve` and
  asserts the resolved path is under `examples/library-consumer/node_modules`, never under the
  monorepo's `engine/` source tree.
- `smoke-core.mjs` — `@engine/core/ecs` (World spawn/query/despawn), `@engine/core/runtime`
  (seeded `Rng` + `fork()` determinism), `@engine/core/sim` (`MessageBus` send/flush/receive).
- `smoke-wasm.mjs` — loads `pathfinding.wasm` from the `@engine/wasm-modules` tarball via
  `createRequire(import.meta.url).resolve(...)` + `fs.readFileSync`, instantiates it through
  `@engine/core/wasm`'s `createPathfinderFromBytes`, and computes a short route.
- `smoke-ui.mjs` — `@engine/ui/widget` (`panel`/`label`/`button`) + `@engine/ui/layout`
  (`computeLayout`) + `@engine/ui/theme` (`DEFAULT_THEME`), asserting rects get written.

  Deliberately NOT exercised in plain Node:
  - `@engine/ui` (the package root) and `@engine/ui/render` — both pull in `?raw` `.wgsl`
    shader imports, a Vite/bundler-only convention plain Node's ESM loader doesn't understand.
  - `@engine/ui/a11y` — mirrors nodes into a real DOM; needs jsdom, which this fixture
    deliberately does not depend on just to prove the packaging story.

## Why this exists

`engine/core`, `engine/ui`, and `engine/wasm-modules` each swap their `package.json`
`main`/`types`/`exports` from source-pointing (`./src/*.ts`, monorepo dev truth) to
dist-pointing (`./dist/*.js`) only during `npm pack`/`npm publish`, via a `prepack`/`postpack`
pair (see `scripts/pack-swap.mjs` in each package). This fixture is the durable proof that the
swapped, packed, tarball-installed artifact actually resolves and runs correctly for an
external consumer — not just that `npm pack` exits 0.
