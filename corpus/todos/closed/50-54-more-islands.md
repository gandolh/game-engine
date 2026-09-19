# Game Briefs 50–54 — "More islands" theme (landmark + interactive islands)

**Status:** Done.
> Merged on 2026-06-13; original specs in git history. (53 superseded into the brief-44 tavern.)

Authored a set of landmark islands to break the archipelago's cardinal symmetry — a mix of purely decorative focal points and light-interaction islands that give the map history, visual life, and strategic waypoints.

## 50 Interactive shrine

- New `REGIONS` entry + 2-wide bridge in `regions.ts`; BFS-reachable, non-adjacent to other islands; walkable-grid and regions tests updated.
- `pray-at-shrine` act handler in `systems/act/` — region-gated, cooldown/one-time guarded; grants a small bounded AP or skill buff sized not to ripple the economy.
- `deliberateShrineVisit` hook wired into the **opportunist** personality's intention queue (natural fit — it already weighs detours); `PerceiveSystem` folds shrine into beliefs.
- Per-farmer cooldown component mirrors existing cooldown patterns; sprite reuses an existing atlas frame (no atlas rebuild).

## 51 Heritage sites

- One or more small **heritage-site islands** (standing stones, ruined walls, old statue) added as `RegionDef`(s) in `regions.ts`; reachable islands get 2-wide bridges and pass the no-adjacency + BFS guard tests.
- Purely decorative — no act handler, no deliberation, no perception, no sim state; hover label names each site.
- Sprites reuse existing `structure/stone` / ruins-like atlas frames; `world-generation.md` updated.

## 52 Waterfall island

- Scenic waterfall island as a decorative focal point; the one island in the set with an **animation** requirement.
- Waterfall frames (`tile/waterfall-a/b/c`) cycle via the same mechanism as the existing ocean ripple / forge-fire animation in `render-systems/static-layer.ts`; atlas rebuilt, `atlas.test.ts` updated.
- Animation is a render concern (wall-clock frame time), kept entirely off the sim/snapshot determinism path; EDG32 palette water blues used throughout.

## 54 Camping/rest island

- Campsite region(s) + bridge in `regions.ts`, placed near the southern band / harbor / fishing isles to serve genuinely far-from-home farmers.
- **Rest logic:** the night/sleep handler treats a farmer whose night-tile is on a campsite region as RESTED — clears/skips the `unrested` flag — instead of applying the away-from-home half-AP penalty; home-sleep path unchanged.
- Wired into the existing rested/unrested resolution in `systems/ap.ts` and the morning wake in `systems/perceive.ts`; all randomness through `rng.fork(label)`.
- Unit test: away-at-campsite ⇒ rested; away-not-at-campsite ⇒ unrested (existing behavior preserved).
