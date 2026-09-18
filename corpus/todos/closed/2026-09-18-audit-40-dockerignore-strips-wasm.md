# audit-40 — `.dockerignore` strips the wasm the sim server reads, and the server degrades silently

status: todo
created: 2026-09-18
context: found by the ops lens of the 2026-09-18 sweep. Two committed files contradict each other, and
the runtime resolves the contradiction by warning and carrying on.

## The gap

[`.dockerignore:3`](../../.dockerignore#L3) is `**/dist`, which matches
`engine/wasm-modules/dist/` — the canonical, **tracked** location of `pathfinding.wasm` (tracked as of
[audit-34](2026-09-14-audit-34-wasm-dist-untracked.md)).

[`infrastructure/Dockerfile:11-12`](../../../infrastructure/Dockerfile#L11-L12) asserts the opposite in
its own header:

> *"The committed wasm artifacts the sim reads (pathfinding.wasm and friends) ride along with the
> source."*

They do not. `COPY engine ./engine` (line 36) copies an `engine/` whose `wasm-modules/dist` was
excluded from the build context.

The loader then **degrades instead of failing** —
[`games/farm/server/src/index.ts:33-39`](../../../games/farm/server/src/index.ts#L33-L39):

```ts
console.warn(`[server] could not read pathfinding.wasm at ${wasmPath} — farmers will not travel `
  + `(run \`npm run build-wasm\`). Behavior will DIFFER from the browser. ${e}`);
return null;
```

And `bootstrapSim` omits `TravelSystem` entirely when no pathfinder is passed, so **every
travel-gated action silently no-ops** — the exact false-dormancy trap recorded in
[`wiki/open-questions.md`](../../wiki/open-questions.md) and [`wiki/decisions.md`](../../wiki/decisions.md).

## Why nothing caught it

The container is built by nobody in CI. `.github/workflows/ci.yml` runs typecheck, tests, five startup
smokes and pack-smoke — none of them build an image. So the only signal is one `console.warn` on a
container's stdout, under a process that pm2/compose report as healthy.

## What to do

Two halves, and the second matters more than the first:

1. Un-ignore the artifacts: `!engine/wasm-modules/dist` after the `**/dist` line (verify the negation
   actually takes effect — order and directory-vs-glob semantics both bite here).
2. **Make a missing pathfinder fatal when it is not supposed to be missing.** A server that serves a
   sim whose farmers cannot move is worse than a server that refuses to start. `NODE_ENV=production`
   is the obvious gate; `run-sim`'s deliberate JS-pathfinder fallback must keep working.

Consider whether the Dockerfile's claim should be a check rather than a comment — a `RUN test -f`
on the artifact in the image build costs nothing and makes the contract self-enforcing.

## Files you OWN
- [`.dockerignore`](../../.dockerignore)
- [`infrastructure/Dockerfile`](../../../infrastructure/Dockerfile)
- [`games/farm/server/src/index.ts`](../../../games/farm/server/src/index.ts) — the loader's failure policy

## Files you must NOT touch
- `engine/wasm-modules/build/*` and the two tracked artifact locations — both are contracts
  (audit-29 drift guard, audit-34, audit-37); this brief changes what is *copied*, never what is built
- the pure-JS fallback [`js-pathfinder.ts`](../../../games/farm/sim-core/src/world/js-pathfinder.ts) —
  it is the headless runner's deliberate path, and JS/WASM are **not** route-equivalent

## Acceptance
- **Demonstrate first**: build the image as it stands and show `pathfinding.wasm` absent inside it and
  the warning on startup. Then show the same build with the fix containing the file.
- With the artifact missing and `NODE_ENV=production`, the server **exits non-zero** instead of
  serving. With it present, it starts and `TravelSystem` is registered.
- `npm run sim` (JS fallback) and `npm run server` (WASM) both still work locally.
- Do NOT add an image build to CI as part of this brief unless it is genuinely seconds — say so either
  way at closeout, since "no gate builds this" is the root cause and leaving it unaddressed should be
  a recorded choice, not an omission.
