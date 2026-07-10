# Brief 105 — Citadel ambient-crowd honesty (~~+ MP villager owner-filter~~)

status: **DONE 2026-07-10 (scope 1). Scope 2 remains PARKED with MP (#21).**

> **Decision (scope 1, recorded on closeout):** of the three options — cap the layer to
> `population`, gate it off above a zoom level, or make ambient figures clearly non-villager —
> we took the **third (make them clearly non-villager)**, the cozy-friendliest. Ambient
> pedestrians are now visibly lesser than real villagers: `PED_SIZE` dropped `TILE_SIZE*0.8` →
> `TILE_SIZE*0.6` (well below the 1.1-tile villager) and dimmed to `alpha 0.55`. The dim is
> applied as the sprite's own `alpha`, **not** baked into the tint's alpha byte, because the
> WebGPU backend discards a tint's alpha channel (traced in `webgpu/renderer.ts`) — a tint-alpha
> dim would silently no-op on real hardware. Landed with brief 104 items 2+4 in one render-only
> chunk (shared `ambient-crowd.ts`). Commit `26deb45`.

status: todo — **reshaped 2026-07-10 (second grilling session): scope 1 only.**
⚠️ Decision **#21** deprecated multiplayer, so **scope 2 (the MP snapshot owner-filter) is parked**.
The bug it describes is real — `getVillagers()` emits ALL villagers while `population` is per-player,
so each MP client renders rivals' villagers as its own crowd — and it is unreachable while nobody runs
MP. It is a revival precondition; do not delete it from this file.
source: [todos/2026-06-27-citadel-entity-count-matches-population.md](../../../todos/2026-06-27-citadel-entity-count-matches-population.md) — the sim-side leak was fixed (`removeOneVillager` + invariant test); these are the two explicitly-deferred halves.

## Scope

1. **Ambient-crowd decision (render-only)**: background figures in
   [ambient-crowd.ts](../../../../games/citadel/client/src/render/ambient-crowd.ts) still
   read as population. Decide and implement ONE of: cap the layer to `population`, gate it
   off above a zoom level, or make ambient figures clearly non-villager (smaller/dimmer/no
   role accessories — probably the cozy-friendliest). Record the decision in the brief on
   closeout. Coordinate with brief 104 (same file/cadence rules).
2. ⛔ **PARKED with MP (#21) — do not build.** **MP snapshot owner-filter (sim/snapshot-side)**: `getVillagers()` emits ALL villagers
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
- ~~Two-tab `?mp`: each client's crowd tracks its own population; rivals distinguishable.~~ *(parked, #21)*
- Solo headless snapshot diff byte-identical; tests green.
