# library-consumer

Out-of-workspace acceptance fixture for the three packable `@engine/*` libraries
(`@engine/core`, `@engine/ui`, `@engine/wasm-modules`). This directory is **outside** the root
`package.json` workspaces globs (`engine/*`, `games/*/*`, `tools/*`) on purpose — it gets its
own `node_modules`, installed from real `npm pack` tarballs via `file:`, so it can prove the
packages work for someone who is NOT inside this monorepo.

## Important: tarballs are gitignored

`tarballs/` and `node_modules/` are gitignored (build artifacts). `package.json` IS committed
for reproducibility, but its `file:./tarballs/...` dependencies **dangle** until you regenerate
the tarballs locally — `npm install` will fail with an ENOENT on a fresh checkout until you run
step 1 below.

There is deliberately **no committed `package-lock.json`**. A lockfile here would pin the
`file:` tarballs' integrity hashes, and those hashes are wrong by construction: every tarball is
rebuilt from the working tree by step 1, so the moment any engine source changes, a committed
lock no longer matches what gets packed and `npm install` fails with `EINTEGRITY`. A lock whose
hashes are disposable on every engine edit documents nothing — don't regenerate and commit one
back.

## Regenerate and run

From the repo root (**not** `--prefix`, see below):

```bash
# 1. Build + pack all three engine packages into this fixture's tarballs/ dir.
#    (prepack builds dist/ and swaps the manifest to dist-pointing exports;
#    postpack restores the dev manifest and deletes the generated dist/ — the
#    working tree ends up unchanged either way.) npm pack does NOT create the
#    --pack-destination directory itself, so mkdir it first.
mkdir -p examples/library-consumer/tarballs
npm pack -w @engine/core         --pack-destination examples/library-consumer/tarballs
npm pack -w @engine/ui           --pack-destination examples/library-consumer/tarballs
npm pack -w @engine/wasm-modules --pack-destination examples/library-consumer/tarballs

# (equivalently, from inside each package dir: npm pack --pack-destination <abs path to tarballs>)

# 2. Install the fixture's own node_modules from those tarballs. --package-lock=false
#    keeps npm from writing a package-lock.json here at all (npm still writes one on a
#    plain `npm install` even with no lock committed) — see the no-lockfile note above.
cd examples/library-consumer
npm install --package-lock=false

# 3. Run the smoke.
npm run smoke   # or: node smoke.mjs
```

**Why `-w`, not `--prefix`:** this fixture lives at `examples/library-consumer/`, **outside**
the root `package.json` workspaces globs (`engine/*`, `games/*/*`, `tools/*`, `docs`) on purpose — see
the top of this file. That's also why `npm pack --prefix engine/core …` from the repo root does
NOT do what it looks like it does: in an npm-workspaces repo, `--prefix` just changes npm's
working directory before running the command, and `npm pack` with no package argument packs
whatever is at that directory's root — here, the **whole monorepo**
(`game-engine-monorepo-0.0.0.tgz`), not `@engine/core`. `npm pack -w @engine/core` names the
workspace explicitly and packs only that package, run from anywhere in the repo. This is the
same form `npm run pack-smoke` already uses.

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
