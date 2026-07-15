# Engine Brief 20 — Retire the ghost subsystems (`animation` Animator/Clip, `assets` audit)

status: todo
source: 2026-07-15 wide structure survey (follow-up to game brief 114). Two `@engine/core`
subpath exports advertise subsystems that have no real consumers.

## Context

- **`@engine/core/animation`** ships `Animator` + `Clip` with **zero consumers outside their own
  tests** — this is the "deleted brief-04 `Animator` ghost" [animation.md](../../../wiki/animation.md)
  already documents. The only living exports are the **easing curves**: Farm's
  [leaderboard.ts](../../../../games/farm/client/src/ui/canvas/leaderboard.ts) imports `easeOutBack`,
  and [`@engine/ui/anim`](../../../../engine/ui/src/anim/easing.ts) re-exports `linear`/`easeOutCubic`
  from it (a deliberate re-export, not duplication — keep that shape).
- **`@engine/core/assets`** (`atlas-format.ts`, `loader.ts`) has exactly **one consumer**:
  [tools/world-preview](../../../../tools/world-preview/src/index.ts). Neither game client loads its
  atlas through it.

## Scope

1. **Delete `Animator` + `Clip`** (`animator.ts`, `clip.ts`, their tests) from
   `engine/core/src/animation/`. Keep `easing.ts` and the `./animation` subpath export (it is the
   shared curve library `@engine/ui` builds on). Git history preserves the deleted code; the
   render-side animation-engine direction in [animation.md](../../../wiki/animation.md) is a
   *future* design that should not be blocked on this dead v1.
2. **Adjudicate `@engine/core/assets`** — pick the cheap honest outcome:
   - If the loader/format is genuinely world-preview-only plumbing → move it into
     `tools/world-preview` and drop the `./assets` subpath export.
   - If either game client *should* be routing its atlas load through it (check how
     `@farm/client` actually loads `public/atlas/` today) → leave it in the engine and file the
     adoption as a separate todo. Do **not** wire adoption in this brief.
3. Update the subpath-exports list anywhere docs enumerate it (root CLAUDE.md architecture
   line, [architecture.md](../../../wiki/architecture.md)) — coordinate with brief 114's doc-map
   fix if it hasn't landed yet.

## Constraints

- Grep-complete, not code-graph-complete: prove zero remaining consumers with `grep -rn` across
  `engine/ games/ tools/` before each deletion (the code graph conflates same-named symbols
  across the two games — see [code-graph.md](../../../wiki/code-graph.md)).
- No behavior change anywhere; this is deletion + relocation only. Determinism untouched.

## Acceptance

- `Animator`/`Clip` gone; `npm run typecheck` 0; full test suite green.
- `@engine/core/assets` either relocated (subpath export removed, world-preview still renders a
  PNG via `npm run preview`) or explicitly kept with a one-line rationale added to
  [animation.md](../../../wiki/animation.md)/[architecture.md](../../../wiki/architecture.md).
- Docs that enumerate engine subpaths match reality.
