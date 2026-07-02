# Brief 105 — Citadel ambient-crowd honesty + MP villager owner-filter

status: todo
source: [todos/2026-06-27-citadel-entity-count-matches-population.md](../../../todos/2026-06-27-citadel-entity-count-matches-population.md) — the sim-side leak was fixed (`removeOneVillager` + invariant test); these are the two explicitly-deferred halves.

## Scope

1. **Ambient-crowd decision (render-only)**: background figures in
   [ambient-crowd.ts](../../../../games/citadel/client/src/render/ambient-crowd.ts) still
   read as population. Decide and implement ONE of: cap the layer to `population`, gate it
   off above a zoom level, or make ambient figures clearly non-villager (smaller/dimmer/no
   role accessories — probably the cozy-friendliest). Record the decision in the brief on
   closeout. Coordinate with brief 104 (same file/cadence rules).
2. **MP snapshot owner-filter (sim/snapshot-side)**: `getVillagers()` emits ALL villagers
   while `population` is per-player — equivalent in solo, wrong in MP (each client renders
   rivals' villagers as its own crowd). Owner-filter (or owner-tag) villagers in the
   snapshot so each client can distinguish; verify the MP render path consumes it. Check
   raiders/armies for the same assumption while there.

## Constraints

- #1 render-only. #2 touches snapshot composition — solo output should stay byte-identical
  (filtering by owner where owner==player is a no-op in solo; prove with the headless diff);
  MP behavior is the change.

## Acceptance

- Live solo: on-screen crowd no longer over-reads population (before/after screenshot).
- Two-tab `?mp`: each client's crowd tracks its own population; rivals distinguishable.
- Solo headless snapshot diff byte-identical; tests green.
