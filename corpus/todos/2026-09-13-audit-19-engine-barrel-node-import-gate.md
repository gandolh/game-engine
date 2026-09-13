# audit-19 — No gate stops the engine barrel from breaking every Node consumer

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Automates the one failure the corpus records as having survived a green typecheck *and* 689 passing tests.

## The gap

[decisions.md](../wiki/decisions.md) → Renderer records two non-obvious constraints, the first being:

> **The renderer must be imported DYNAMICALLY.** `createRenderer` uses `await import("./webgl2/renderer")`,
> and `render/index.ts` exports `WebGl2Renderer` as a **type only**. The WebGL2 passes
> `import … from "*.glsl?raw"`, which only a bundler resolves — a static import or a value export crashes
> every Node consumer (both game servers, `run-sim`, `world-preview`, `citadel-sim`, `hollow-sim`) with
> `ERR_UNKNOWN_FILE_EXTENSION`. This happened once during the migration and **typecheck plus 689 passing
> tests did not catch it.**

The constraint is real and currently honoured — [render/index.ts](../../engine/core/src/render/index.ts)
carries the `// TYPE-ONLY on purpose` comment above `export type { WebGl2Renderer }`. But nothing
*enforces* it, and the surface is wide:

- The root barrel [engine/core/src/index.ts](../../engine/core/src/index.ts) does
  `export * from "./render"`, so every Node consumer pulls the render module graph transitively.
- **334** bare `from "@engine/core"` imports across the repo (vs. a handful using the 16 declared subpath
  exports), including `tools/run-sim`, `tools/world-preview`, `games/farm/server` and
  `games/citadel/server`. Measured 2026-09-13.
- The barrel already shows strain: it needs an explicit `export type { Sprite } from "./ecs"` to resolve a
  name collision between `./ecs` and `./render`.

So the protection is one careless `export` away from failing, and the failure mode is "every headless tool
and both servers crash on startup" — with the existing gates green.

## Failure scenario

Someone converts `export type { WebGl2Renderer }` to a value export (a natural-looking tidy-up, e.g. to
allow `instanceof`), or adds a value export of any module that transitively imports a `.glsl?raw` file.
`npm run typecheck` passes. `npm run test` passes (render tests stub the GL context and run under Vite's
resolver). Then `npm run sim`, `sim:citadel`, `sim:hollow`, `preview`, `npm run server` and
`npm run server:citadel` all fail at import time.

## Fix sketch

Add a **Node-context import smoke test** — the thing `decisions.md` asks for ("verification must include
running things") and nothing automates:

- A test that imports `@engine/core` (and `@engine/core/render`) through the same resolver the tools use
  (`tsx`), in a `node` environment with **no bundler**, and asserts it resolves. Note that plain
  `node --experimental-strip-types` cannot resolve this repo's extensionless/directory imports — verified
  2026-09-13, it fails with `ERR_UNSUPPORTED_DIR_IMPORT`. So drive it through `tsx`, matching how every
  Node consumer actually starts.
- Assert no `.glsl` module is reachable from the barrel without a dynamic import.
- Cheapest complementary version: a startup smoke step in CI that runs each headless tool with a
  1-day/20-tick budget purely to prove it boots. Fold into
  [audit-06](2026-09-13-audit-06-ci-gate.md) if that lands first — coordinate rather than duplicating.

Consider also whether the 334 bare-barrel imports should migrate toward subpath imports. **Do not do that
migration in this spec** — it is a large mechanical change with its own risk. Just record the finding; the
gate is what buys safety.

## Files you OWN
- new test under `engine/core/src/` (colocated, e.g. `node-import.test.ts`) or a small script invoked from CI
- [engine/core/src/index.ts](../../engine/core/src/index.ts) / [render/index.ts](../../engine/core/src/render/index.ts)
  only if a comment needs strengthening — **do not restructure the barrels here**

## Files you must NOT touch
- the dynamic `createRenderer` import or the type-only export — they are correct; this spec protects them
- the 334 call sites

## Acceptance
- The gate **fails** when `WebGl2Renderer` is temporarily converted to a value export. Demonstrate the red,
  then revert. Without that demonstration the gate is unproven.
- The gate passes on a clean tree and runs in seconds.
- It is wired into `npm run test` (so it runs by default) — and note in the spec close-out whether
  audit-01's cache fix is in place, since otherwise a warm cache can skip it.
