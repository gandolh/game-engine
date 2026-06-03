# Game Brief 33 — World Expansion

## Status: Done (2026-06-03)

## Summary

Expanded the 40×40 world from 5 regions to 11, added a full tool/resource economy
(tools with durability and tiers, watering can, wood/stone/geode/iron-ore drops),
farm decorations that boost crop yield, and a dedicated home entity per farm for the
sleep routine.

## World layout additions

### New regions (all connected via 2-tile wide roads)

| Region | Location | Purpose |
|---|---|---|
| `blacksmith` | SE corner (30–39, 30–39) | Tool upgrades; NPC with forge-floor tiles |
| `carpentry` | NW corner (0–9, 0–9) | Craft farm decorations from wood; wood-plank floor |
| `forest-north` | NE (26–33, 0–7) | Dedicated tree zone — trees only, 25%/tile/day |
| `quarry-north` | Far NE (35–39, 0–9) | Dedicated stone zone — stones only, 20%/tile/day |
| `forest-south` | SW (0–7, 26–33) | Dedicated tree zone for Otto/Hannah pair |
| `quarry-south` | Far SW (0–9, 35–39) | Dedicated stone zone for Otto/Hannah pair |

North pair (forest-north + quarry-north) serves Cora + Atticus.
South pair (forest-south + quarry-south) serves Otto + Hannah.
All 11 regions BFS-verified reachable from every farm.

### Road network additions
- L-bridge (blacksmith): vertical `(26–27, 22–29)` + horizontal `(26–29, 28–29)`
- Carpentry connectors: `(10–17, 12–13)` + `(10–11, 10–13)`
- Forest/quarry connectors: short 2-tile paths from each farm edge to zone entry

### Tile floors
- `backdropFrame` updated: `blacksmith` → `tile/forge-floor`, `carpentry` → `tile/wood-plank`,
  `forest-*` → `tile/grass`, `quarry-*` → `tile/quarry-floor`, village inner square → `tile/market-floor`

## Tool system

New types in `components.ts`: `ToolKind` (hoe/axe/pickaxe), `ToolTier` (wooden/stone/iron),
`Tool { kind, tier, durability }`, `WateringCan { charges, maxCharges: 10 }`.

| Tier | Durability | Work time | Buy price |
|---|---|---|---|
| wooden | 100 | 3s (60 ticks) | 5g (shop) |
| stone | 150 | 2s (40 ticks) | 7g (shop) → 15g upgrade at blacksmith |
| iron | 200 | 1s (20 ticks) | 10g (shop) → 25g upgrade at blacksmith |

All farmers start with one wooden hoe + axe + pickaxe + full watering can (10 charges).

## Resource economy

### `TileFeatureSystem`
- Spawns trees/stones on farm tiles (2%/1.5% per tile/day, cap 6) and in dedicated
  resource zones (25%/20% respectively, cap 20, type-locked).
- Drops: tree → 2 wood; stone → 1 stone + 20% iron-ore or 10% geode chance.
- Stored in `ResourceInventory { wood, stone, ironOre, geodes }` on farmer.

### New intentions (all wired in `ActSystem`)
- `till` — hoe creates a new plot on any free farm tile (1 AP, 1 hoe durability)
- `chop-tree` — axe fells a tree feature (1 AP, 1 axe durability)
- `mine-stone` — pickaxe mines a stone feature (1 AP, 1 pickaxe durability)
- `refill-can` — refill watering can at farm fountain (2 AP)
- `buy-tool` — buy wooden tool from shopkeeper (1 AP, deducts gold)
- `upgrade-tool` — upgrade at blacksmith (2 AP, deducts gold)
- `craft-decoration` — craft a farm decoration at carpentry (2 AP, deducts wood)

## Farm decorations

Placed by visiting carpentry and spending wood. Each decoration permanently boosts
crop yield for the farm's `HarvestSystem` calculation:

| Decoration | Wood cost | Yield boost |
|---|---|---|
| scarecrow | 3 | +10% |
| flower-bed | 5 | +15% |
| fence-art | 8 | +20% |
| windmill | 12 | +30% |

Stacked boost capped at +75% per farm. `HarvestSystem` now reads all `farmDecoration`
entities to compute the multiplier before awarding crops.

## Plot expansion + decay

- Farmers can till new plots anywhere on their farm using a hoe (`deliberateTill`).
- Empty plots decay after 5 days without tending (`PLOT_DECAY_DAYS = 5`) — entity
  despawned, requires re-tilling.

## Home entities

- One `HomeTag` entity (farmhouse sprite) spawned at the bottom-right corner of each farm.
- Used by `deliberateSleep` — all farmers travel home during the evening phase to avoid
  the unrested AP penalty (see brief 35).

## Agent deliberation additions (`watering.ts` shared helpers)
- `deliberateRefillCan` — queue refill-can if watering can is low
- `deliberateTill` — till new plots up to per-personality cap
- `deliberateResourceGather` — chop/mine features on own farm
- `deliberateDecoration` — craft decorations when wood available, travel carpentry
- `deliberateUpgrade` — upgrade tools at blacksmith when gold available
- `deliberateResourceZoneVisit` — travel to forest/quarry when own farm depleted
- `deliberateEarlyVillageVisit` — visit village day 0–1 to scout market
- `deliberatePeriodicMarketVisit` — visit village every 3 days regardless of inventory

## Key files
- `packages/farm-valley/src/world/regions.ts` — 11 regions + road network
- `packages/farm-valley/src/world/region-setup.ts` — fountain + home + blacksmith + carpenter spawning
- `packages/farm-valley/src/components.ts` — ToolKind, WateringCan, FarmDecoration, HomeTag, etc.
- `packages/farm-valley/src/systems/tile-features.ts` — new TileFeatureSystem
- `packages/farm-valley/src/systems/act.ts` — 8 new intention cases
- `packages/farm-valley/src/systems/harvest.ts` — decoration yield multiplier
- `packages/farm-valley/src/agents/watering.ts` — 8 new shared deliberation helpers
- `packages/farm-valley/src/world/walkable-grid.test.ts` — updated to 1257 walkable tiles
