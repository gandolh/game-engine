# Brief 104 — Citadel movement feel polish (gait, facing, corner-cutting)

status: todo (render-only)
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
