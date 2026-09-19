# audit-53 — Three live corpus pages describe code that no longer exists, including one open work item

status: todo
created: 2026-09-18
context: found by the undone-work lens of the 2026-09-18 sweep. `corpus/lint.sh` passes (0 broken live
links) because these are *semantic* drift, not broken links — the pages resolve fine and say
false things.

## The three

**1. [`wiki/performance.md`](../../wiki/performance.md) profiles a renderer deleted on 2026-08-18.**
Five references to `canvas2d/renderer.ts` at lines 67, 108, 161, 166, 184 — and `ls
engine/core/src/render/` shows only `webgl2/`. Line 67 is the worst, because it is an **open
checkbox**:

> *"- [ ] **4. Tier 2 culling now actually bites …** Dynamic sprites/shadows are still not
> viewport-culled and `this.queue.sort(compareSprite)` runs every frame (`canvas2d/renderer.ts`)"*

This is the page an agent reads before doing perf work, and nobody can tell from it whether the culling
gap is real in WebGL2 or was fixed by the migration. A stale open item is worse than a missing one.
[`wiki/asset-pipeline.md:12`](../../wiki/asset-pipeline.md) has the same problem (*"The renderer
(`canvas2d`) resolves frames per-sheet via `atlasId`"*).

**2. [`wiki/citadel-decisions.md`](../../wiki/citadel-decisions.md) contradicts itself about what is
built.** Line 176 (#24): *"Challenge mode is solo-only … Unblocked; **still unbuilt**."* — but the code
has it end to end ([`sim-worker.ts:83-117`](../../../games/citadel/client/src/worker/sim-worker.ts#L83-L117),
`new-game-modal.ts`, `?challenge` in `boot.ts`) and the **same page's table at line 244** says
*"Challenge mode — **DONE** 2026-07-13 (`c2caecc`)"*. Line 241 says brief 113 "raid gets a body" is
*"Filed, not built"*, while the brief sits in `briefs/game/done/` and `raid-spawn.ts` /
`raider-movement.ts` exist. #24 is that page's own "what is left on Citadel" list, so an agent asked
that question gets two phantom items and skips the real ones.

**3. Both OPEN Hollow todos park a task behind a blocker that was removed.**
[`2026-07-17-hollow-00-BUILD-ORDER.md`](../2026-07-17-hollow-00-BUILD-ORDER.md) decision #7 says
*"Rendering = true 3D, **raw WebGPU**"*; [`2026-07-17-hollow-BUILD-STATE.md`](../2026-07-17-hollow-BUILD-STATE.md)
at lines 164 and 172-180 says the visual acceptance is un-self-verifiable and needs *"Chrome 113+ (or
enable `chrome://flags` → 'Unsafe WebGPU')"*. The renderer is WebGL2
(`engine/core/src/render3d/webgl2/`), and [`wiki/hollow-overview.md`](../../wiki/hollow-overview.md)
already says the 3D image *"is verifiable in-sandbox since the WebGL2 migration"*. These are the two
files whose headers say "read this first to resume Hollow", and they make a now-cheap task look
blocked.

## What to do

Correct all three. For each stale claim, **verify against the code before rewriting** — the point is
not to delete the word `canvas2d` but to answer the question the page was trying to answer. Perf item
4 in particular needs someone to check whether WebGL2 culls dynamic sprites, and then either re-state
the gap in WebGL2 terms or tick it off with the evidence.

The Hollow todos are **open** work items, not archives, so they are editable (unlike anything in
`todos/closed/`). Fix the blocker text and the renderer name in place.

While there: `bash corpus/lint.sh` reports **8 oversized pages** against its own ~200-line cap. That is
a separate brief ([audit-58](../2026-09-18-audit-58-status-md-retrieval-budget.md)); do not start
splitting pages here.

## Files you OWN
- [`wiki/performance.md`](../../wiki/performance.md), [`wiki/asset-pipeline.md`](../../wiki/asset-pipeline.md)
- [`wiki/citadel-decisions.md`](../../wiki/citadel-decisions.md)
- [`2026-07-17-hollow-00-BUILD-ORDER.md`](../2026-07-17-hollow-00-BUILD-ORDER.md), [`2026-07-17-hollow-BUILD-STATE.md`](../2026-07-17-hollow-BUILD-STATE.md)
- `corpus/index.md` + `corpus/log.md` entries for the change

## Files you must NOT touch
- **anything in `todos/closed/` or `briefs/`** — frozen specs; their code references decay by design
  and `lint.sh` only counts them
- `wiki/status.md`'s historical brief tables — a row describing what a past brief did is not drift
- source code: this is a documentation brief. If verifying perf item 4 turns up a real culling gap,
  file it as its own spec rather than fixing it here.

## Acceptance
- `grep -rn 'canvas2d' corpus/wiki/` returns only deliberate historical references (decisions.md's
  deletion record, status.md's brief-01 table row).
- `citadel-decisions.md` no longer contradicts its own table; #24 and the 113 row reflect the code.
- Neither Hollow todo claims WebGPU or a Chrome gate.
- Perf item 4 is either re-stated against WebGL2 with evidence, or ticked with evidence. Not deleted.
- `bash corpus/lint.sh` still passes.
