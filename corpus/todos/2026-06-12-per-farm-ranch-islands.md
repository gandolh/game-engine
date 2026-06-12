---
title: Give each farm a neighbouring ranch island (hosts its livestock)
created: 2026-06-12
status: done
tags: [world, render, sim, livestock]
depends_on: [foundation-grow-grid-to-240, foundation-theme-decor-table]
---

# Give each farm a neighbouring ranch island (hosts its livestock)

> **DONE 2026-06-12.** 21 ranch islands (`ranch-0..20`, kind `'ranch'`, theme
> `'ranch'`), one per farm. **Placement deviates from "radial-outward":** the grow
> (#0) left NO outer margin, so outer-ring farms can't fit a ranch outward (would
> exceed 240). Instead each ranch is placed in the **cardinal direction that fits**
> (outward-preferred → tangential → inward), 8×8, at center-distance D∈{12,11,13},
> chosen by a deterministic per-farm search that requires in-bounds + ≥2 gap + a
> clean straight farm↔ranch bridge. Result: 13 outward, 8 sideways, 0 inward; all
> 21 placed without throw. `ranchForFarm(farmId)` exported. Pens **relocated** to the
> ranch (`handleBuildPen` → `ranchForFarm(homeRegion)`). **Tend now requires crossing
> the bridge:** `handleTend` gated on `currentRegion === pen.regionId`;
> `deliberateTendPens` queues a travel to the ranch first — so ranches get real daily
> AI traffic (decision A), not inert dead-ends. regions.ts was restructured (road
> primitives + bridge generators moved above the ranch section; generators now take
> a `regions` param). Guard test (ranch-islands.test.ts, 7 tests) + tend-gate test;
> full repo **1071 tests** + typecheck green. Render eyeball pending. See
> [log.md](../log.md) 2026-06-12.

Each of the 21 farms gets its own **neighbouring ranch island** a short distance
away — and the farm's **livestock lives there**. Cows + sheep (and chickens) in
pens on the ranch; the farmer crosses the bridge to tend them and collect
milk/wool/eggs to sell.

## REFRAMED 2026-06-12 — livestock already exists; this is RELOCATION + placement

The whole livestock feature is **already built** — this todo does NOT add animal
mechanics. Verified in
[components/livestock.ts](../../packages/sim-core/src/components/livestock.ts):

- `AnimalKind = "chicken" | "cow" | "sheep"`; `ProductKind = "egg" | "milk" | "wool"`.
- `Pen` (barn → milk/wool, coop → eggs; `care` 0–1 decays daily, `fedToday`).
- [LivestockSystem](../../packages/sim-core/src/systems/livestock.ts) — daily seeded
  production into owner inventory, quality from care score.
- Full BDI loop: `deliberateBuildPen` / `deliberateBuyAnimal` (herd cap 3) /
  `deliberateTendPens` / `deliberateSellProducts`
  ([agents/watering/livestock.ts](../../packages/sim-core/src/agents/watering/livestock.ts)).
- Today pens physically live **on the farmer's own farm** (build paid via a
  carpentry trip).

## Decisions (grilled 2026-06-12)

- **(A) Relocate pens to the ranch island.** A farm's barn/coop is placed on its
  neighbouring ranch island; the farmer **crosses the bridge** to tend + collect.
  Pen-placement logic must target the **ranch region** instead of the farm. This
  gives the ranch (and its bridge) a real purpose — daily AI traffic — so ranches
  are NOT inert dead-ends.
- **Keep the existing emergent buy gate** — no hard day-lock. Farmers already buy
  animals only once they have surplus gold (naturally mid/late game). "Buyable from
  the market later in the game" = this emergent behavior, not a new unlock.
- **Placement: procedural radial-outward leaf.** Each ranch at `r + Δ` on its
  farm's own radial angle (mirror `ringSlotBounds`), ~8×8, dead-end leaf bridged
  farm→ranch (outward leaves can't hijack inward farm→cluster spokes, which
  `generateFarmSpokes` would throw on). Rides on
  [grow-grid-to-240](2026-06-12-00-foundation-grow-grid-to-240.md). **RISK:** inner-
  ring ranches land between the two rings — verify no collision with outer farms.
- **`ranch` theme** ([theme + décor table](2026-06-12-00-foundation-theme-decor-table.md))
  — fences/troughs/barn-style décor wrapping the *actual* working barn. Décor is
  render-only; the pen/animals are the existing sim entities. EDG32-only,
  deterministic off `WORLD_GEN_SEED`.
- One placement function + a guard test (21 ranches keep ≥2 margin + each bridges
  cleanly). AP cost of the extra bridge-hop tend routine is acceptable.

## Acceptance

- All 21 farms have a distinct neighbouring ranch island, bridged to the farm.
- Each farm's pens/animals are placed on its ranch island; AI farmers travel there
  to tend and collect milk/wool/eggs (existing livestock loop, new location).
- Ranches read as ranches (ranch theme décor around the working barn).
- No-adjacency ≥2-tile gap + full bridge connectivity hold (`walkable-grid.test.ts`,
  `regions.test.ts` green); livestock still produces deterministically (3-day/3-seed
  fast diff byte-identical).
