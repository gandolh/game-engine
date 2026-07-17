# @engine/wasm-modules

The AssemblyScript compute kernels behind `@engine/core/wasm`. Each source under `src/`
compiles to a standalone `.wasm` with a tiny raw export surface (numbers + linear memory,
no runtime). The JS wrappers that instantiate and call them live in `@engine/core/wasm`
(`Pathfinder`, `NoiseGenerator`), not here.

> **License:** MIT. **Status:** not yet published — `@engine/*` names are placeholders.

## Kernels

| Source | Purpose | JS wrapper in `@engine/core/wasm` |
| --- | --- | --- |
| `src/pathfinding.ts` | Grid A\*/BFS path search — `findPath(grid, w, h, sx, sy, ex, ey, out, cap)`. | `Pathfinder` |
| `src/noise.ts` | Value/fBm noise fill into a buffer. | `NoiseGenerator` |
| `src/rng.ts` | WASM-side RNG kernel. | *(no wrapper yet — raw `.wasm` only)* |
| `src/floodfill.ts` | Region flood fill. | *(no wrapper yet — raw `.wasm` only)* |

Only `pathfinding` and `noise` currently have JS wrappers exported from
`@engine/core/wasm`; `rng` and `floodfill` compile to `.wasm` but you must instantiate
them yourself via the generic `loadWasmModule` loader.

## Instantiation: bytes in, not paths

The engine never hard-codes a fetch path. You hand it **bytes** and it instantiates —
so the same call works in a browser (fetch/`import ?url`), in Node (read the file), and
in a test. The factories:

```ts
import { createPathfinderFromBytes } from "@engine/core/wasm";

const bytes = await readWasmSomehow();                 // BufferSource — your choice how
const pf = await createPathfinderFromBytes(bytes);
const route = pf.findPath(
  { cells: grid, width: 32, height: 32 },              // cells: Uint8Array, 0 = walkable
  { x: 0, y: 0 },
  { x: 20, y: 12 },
);
```

`createPathfinderFromUrl(url)` is a convenience that `fetch`es for you (browser only).
`NoiseGenerator` has the same `…FromBytes` / `…FromUrl` pair. For the un-wrapped kernels,
use `loadWasmModule({ bytes })` from `@engine/core/wasm` and call the raw exports directly.

## Committed-artifact policy

The compiled `.wasm` is **checked into the repo** (the build emits to this package's
`dist/` and also stages copies into the reference game's `public/wasm/`). A fresh clone
runs without a wasm build step. **Re-run the build and commit the artifacts whenever you
edit any `src/*.ts`** — stale committed `.wasm` is a silent correctness bug.

```
npm run build -w @engine/wasm-modules   # or, from the repo root:
npm run build-wasm
```

The build is `build/compile.mjs`: it runs `asc` over every `src/*.ts` into `dist/`. (In
this monorepo it additionally copies each `.wasm` into the farm client's `public/wasm/`
for the reference game — that copy path is a repo convenience, not part of the package's
own artifacts; a tarball consumer relies only on the in-package `dist/`.)

## Determinism caveat — do NOT mix the JS fallback across a baseline

`@engine/core/wasm`'s `Pathfinder` satisfies a `PathfinderLike` interface, and the repo
also ships a pure-JS pathfinder that satisfies the same interface (so headless tools can
run without instantiating wasm). **The two are NOT route-equivalent** — given the same
grid they can return different (equally valid) paths, because they explore in different
orders. That is fine within one run, but it means:

- **Never** compare a WASM-pathfinder run against a JS-pathfinder run and expect
  byte-identical sim output.
- Pick one pathfinder implementation and hold it fixed for the life of a determinism
  baseline. Switching implementations invalidates the baseline exactly as a code change
  would.

## Adding a kernel

1. Drop `src/<name>.ts`. Export raw values (numbers / `usize`); use `heap.alloc(size)`
   for scratch — no closures, manual memory (AssemblyScript `stub` mode).
2. Run the build; `dist/<name>.wasm` (and the staged farm copy) appear.
3. Either add a JS wrapper in `@engine/core/wasm`, or instantiate it with the generic
   `loadWasmModule({ bytes })`.

## Why AssemblyScript

TypeScript-shaped, matches the repo's style, and needs no external native toolchain — the
compiler ships as an npm package and runs in Node. Trade-off: it is a distinct language
(no closures, manual memory, AS built-ins like `load<T>`/`store<T>`).
