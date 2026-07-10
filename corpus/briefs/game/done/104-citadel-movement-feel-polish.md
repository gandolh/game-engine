# Brief 104 — Citadel movement feel polish (gait, facing, corner-cutting)

status: **DONE 2026-07-10 (all four items).**

> **Closeout 2026-07-10 (items 2 + 4).** Item 2 (**L/R sprite facing flip**):
> `VillagerHeadingTracker` (`render/citadel-renderer.ts`) now tracks a hysteretic `facing`
> sign — it commits to a new facing only when the smoothed unit heading's horizontal
> component `|ux|` clears `FACING_FLIP_DEADZONE = 0.3`, and holds the last facing when idle or
> moving near-vertically, so a villager never flip-flops on a staircase path. Applied via the
> existing `Canvas2dSprite.flipX` (already implemented on both WebGPU and Canvas2D backends —
> no new plumbing). Item 4 (**ambient-crowd cadence parity**): the ambient crowd's private bob
> constants were removed and its walk bob routed through the same `gaitOffset(timeSec, id,
> moving)` villagers use, so both layers stride on one cadence. Landed with brief 105 scope 1 in
> one render-only chunk. Commit `26deb45`. Browser: real-WebGPU run confirmed clean rendering,
> figures present on roads, no smearing (reloads 0); the facing hysteresis and bob-parity are
> additionally pinned by numeric tests (hand-derived iso sequences; an exact `gaitOffset`
> frame-for-frame proof). Items 1 (gait) and 3 (corner-cutting spline) were already live.

status: partial (render-only)

> **Progress 2026-07-08:** item 3 (**diagonal corner-cutting**) shipped in response to
> a "npcs move unnatural on the road" report. [EntityInterpolator](../../../../games/citadel/client/src/render/entity-interp.ts)
> now keeps a `prevPrev` history tile and drives each `prev→cur` segment with a cubic
> Hermite/Catmull-Rom spline (start tangent leans on `prevPrev`) so units round the
> 4-connected staircase instead of flicking 90° at every tile. Exactly linear on straight
> runs; corner-curving gated behind a `histValid` flag so nothing bends off a stale tile
> after teleport/respawn or on the first step out of rest (all snap/teleport rules kept).
> Render-only, zero sim impact; 3 new interp tests, @citadel/client 423/423 green. Item 1
> (walk-gait `gaitOffset`) + the lean/squash heading were already live. **Still open:**
> item 2 (explicit L/R sprite facing flip), item 4 (ambient-crowd cadence parity), and the
> live playtest-citadel feel sign-off (the 2026-07-08 pass was code-only).

source: [todos/2026-06-27-citadel-entity-movement-natural-feel.md](../../../todos/2026-06-27-citadel-entity-movement-natural-feel.md) — the interpolation half shipped (`EntityInterpolator`, commit `3b19275`); this brief is the explicitly-deferred residue.

## Scope (all render-only, zero sim/determinism impact)

1. **Walk-cadence gait**: extend the idle `bobOffset` in
   [citadel-fx.ts](../../../../games/citadel/client/src/render/citadel-fx.ts) to a step
   cadence while a unit's interpolated position is moving, with ease-in/out at start/stop.
2. **Facing/flip**: L/R sprite flip from the movement delta (the screen-space heading
   tracker already computes continuous deltas — consume it).
3. **Diagonal corner-cutting on the *rendered* path**: 4-connected sim paths staircase;
   smooth the rendered trajectory (e.g. cut corners across consecutive-step turns) without
   touching the sim path.
4. Keep the **ambient crowd** on the same cadence rules so the two layers read alike
   (coordinate with brief 105, which may cap/distinguish that layer — land 105's decision
   first or in the same session).

## Constraints

- Never feeds back into commands or the tick; snap (don't smear) on teleport/despawn/new-id
  — the interpolator's existing rules are the model.
- Frame budget on the large windowed map unaffected ([build-budget.ts](../../../../games/citadel/client/src/render/build-budget.ts)).

## Acceptance

- Live in `npm run citadel`: villagers/raiders visibly stride (not glide-as-statues), face
  their travel direction, and diagonals read as diagonals; no smearing on load/replay.
- @citadel/client tests green; a real-browser feel pass (playtest-citadel) signs it off.
