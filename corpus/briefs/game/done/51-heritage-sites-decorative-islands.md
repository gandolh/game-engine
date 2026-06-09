# Game Task 51 — Heritage / history sites (decorative islands)

## Context

Part of the **"more islands"** theme (user request, 2026-06-09), alongside the
shrine ([brief 50](50-interactive-shrine-landmark.md)), the waterfall island
([brief 52](52-waterfall-island.md)), the remote bar ([brief 53](53-remote-bar-gold-for-ap.md)),
and the camping area ([brief 54](54-camping-rest-island.md)). The archipelago
reads as functional but a bit sterile; authored landmark islands break the
cardinal symmetry and give the world history/place.

This is the **lowest-risk** island in the set: purely DECORATIVE, no interaction.
It's the on-island cousin of the open-water décor props shipped in brief 49
track 6 ([render-systems/set-pieces.ts](../../../../packages/farm-valley/src/render-systems/set-pieces.ts)).

## Goal

Add one or more small **heritage-site islands** — e.g. ancient standing stones, a
ruined wall, an old statue, a monument — that are reachable (or even just
visible) landmarks with NO gameplay behavior. Pure visual focal points that make
the map feel lived-in and historical.

## Design

- **Presence-only.** New `RegionDef`(s) in [regions.ts](../../../../packages/farm-valley/src/world/regions.ts)
  with bounds + center, connected by a 2-wide bridge (or left as an unreachable
  scenic islet — decide per site; an unreachable one needs NO bridge but should
  be visibly distinct, like the coral reefs which sit outside the region model).
- **Sprites:** reuse existing atlas frames where possible (`structure/stone`,
  ruins-like tiles); only add a new atlas frame if a monument truly needs one
  (that's an atlas rebuild + `atlas.test.ts` — flag it, prefer reuse).
- **NO** act handler, NO deliberation, NO perception, NO sim state. Hover label
  only (so the tooltip names it).
- If reachable: update `walkable-grid.test.ts` + `regions.test.ts` (recompute
  count, re-assert no-adjacency ≥2-tile margin + BFS reachability — they already
  recompute). If unreachable/scenic: model like coral (outside REGIONS) so the
  guard tests are untouched.

## Files in scope (verify before editing)

- [regions.ts](../../../../packages/farm-valley/src/world/regions.ts) — region + bridge (if reachable).
- [render-systems/set-pieces.ts](../../../../packages/farm-valley/src/render-systems/set-pieces.ts) / [geometry.ts](../../../../packages/farm-valley/src/render-systems/geometry.ts) — décor render path (if modeled as props, not a region).
- Hover label wiring (snapshot-builder).

## Determinism

Render-only / static layout — no RNG, no sim. If placement uses any seeded
scatter, thread the fixed `WORLD_GEN_SEED` like set-pieces/jitter
([project_mining_random_determinism]). EDG32 palette only.

## Acceptance

- `npm run typecheck` (confirm farm-valley package, not just engine) + `npm run test` green.
- If reachable: guard tests updated; no-adjacency + BFS hold. If scenic: guard tests untouched.
- Visible in `npm run dev`; breaks the symmetry; hover names it.
- world-generation.md updated.

## Workflow

Opus plans, Sonnet executes ([feedback_subagent_workflow]). Lowest-risk of the
island set — good warm-up. Do not commit until asked.
