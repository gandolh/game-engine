# Game Task 49 — Organic procgen: coherent noise + authored detail

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Upgrade world generation from blocky hash noise to spatially coherent terrain that feels grown. Six tracks ordered cheapest-first, each independently shippable. Prior state: ground texture was single-sample hash noise in [ground-noise.ts](../../../../packages/farm-valley/src/render/ground-noise.ts); islands were axis-aligned rects with no authored set-pieces.

## What shipped

- **Track 1 — fBm ground texture** ([ground-noise.ts](../../../../packages/farm-valley/src/render/ground-noise.ts)): replaced single-sample hash noise with fractional Brownian motion (lacunarity 2, gain 0.5) — render-only, no sim/walkability impact.
- **Track 2 — Domain warping** ([ground-noise.ts](../../../../packages/farm-valley/src/render/ground-noise.ts)): Inigo Quilez-style `fbm(p + 4·fbm(p + 4·fbm(p)))` for organic terrain outlines. Fully deterministic and seed-friendly.
- **Track 3 — Coherent-noise kernel**: evaluated Simplex vs hash; octave rotation applied to mitigate grid-axis directional artifacts. Evaluated against `noise.wasm` (committed hash kernel); upgraded if changed → `npm run build-wasm` + artifacts committed.
- **Track 4 — Constructive layout** ([regions.ts](../../../../packages/farm-valley/src/world/regions.ts)): jittered placement → spacing, MST (Prim/Kruskal) over island centers for connectivity, forced plot core for reachability; `walkable-grid.test.ts` + `regions.test.ts` updated.
- **Track 5 — L-system vegetation scatter** (`systems/tile-features.ts`): grammar/L-system tree/feature scatter as alternative to per-tile threshold rolls; pairs with blue-noise décor scatter.
- **Track 6 — Authored set-pieces**: handcrafted prefab stamping over the procedural base (hybrid handmade/procedural). Reuses the `coral.ts` deterministic open-water décor pattern from `packages/farm-valley/src/world/`.

## Key invariants

- All randomness through `rng.fork(label)` — never `Math.random`/`Date.now`.
- fBm and domain warp are pure functions of position + seed.
- `regionAt`/`buildWalkableGrid` rect model preserved unless a track explicitly moves to Model B (flagged separate decision in world-generation.md).
- [world-generation.md](../../../wiki/world-generation.md) updated to reflect which menu items moved from "menu" to "implemented."
