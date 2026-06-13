# Game Brief 33 — World Expansion

**Status:** Done (2026-06-03)
> Condensed 2026-06-13 — original spec in git history.

Expanded the 40×40 world from 5 regions to 11, added a tool/resource economy (tools with durability and tiers, watering can, wood/stone/geode/iron-ore drops), farm decorations that boost crop yield, and a dedicated home entity per farm for the sleep routine.

## What shipped

- **6 new regions** in [regions.ts](../../../../packages/farm-valley/src/world/regions.ts): `blacksmith` (SE), `carpentry` (NW), `forest-north`/`quarry-north` (NE, serves Cora+Atticus), `forest-south`/`quarry-south` (SW, serves Otto+Hannah). All 11 BFS-verified reachable.
- **Tool system** in `components.ts`: `ToolKind` (hoe/axe/pickaxe), `ToolTier` (wooden/stone/iron), `Tool { kind, tier, durability }`, `WateringCan { charges, maxCharges: 10 }`. Tiers: wooden 100 dur/60t work/5g; stone 150/40t/15g upgrade; iron 200/20t/25g upgrade. All farmers start with one of each + full can.
- **`TileFeatureSystem`** (`systems/tile-features.ts`): spawns trees/stones on farm tiles (2%/1.5%/day, cap 6) and in dedicated zones (25%/20%, cap 20). Drops: tree → 2 wood; stone → 1 stone + 20% iron-ore or 10% geode. Stored in `ResourceInventory { wood, stone, ironOre, geodes }` on farmer.
- **8 new intentions** wired in `ActSystem`: `till`, `chop-tree`, `mine-stone`, `refill-can`, `buy-tool`, `upgrade-tool`, `craft-decoration`, plus `deliberateResourceZoneVisit`.
- **Farm decorations** (`HarvestSystem`): crafted at carpentry; scarecrow +10%, flower-bed +15%, fence-art +20%, windmill +30%; stacked boost capped at +75%.
- **Plot decay**: empty plots despawn after `PLOT_DECAY_DAYS = 5` without tending.
- **Home entities**: `HomeTag` farmhouse sprite at bottom-right of each farm; used by `deliberateSleep` to avoid the unrested AP penalty.
- **8 new shared deliberation helpers** in `agents/watering.ts`: `deliberateRefillCan`, `deliberateTill`, `deliberateResourceGather`, `deliberateDecoration`, `deliberateUpgrade`, `deliberateResourceZoneVisit`, `deliberateEarlyVillageVisit`, `deliberatePeriodicMarketVisit`.
- Walkable tile count updated to 1257 in `walkable-grid.test.ts`.
