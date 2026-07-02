# Brief 99 — P2 debt cleanup batch (review findings 28–35)

status: todo
source: [2026-07-02 review findings items 28–35](../../../todos/2026-07-02-full-repo-review-findings.md) — the file:line detail lives there; verify each against current code first (brief 97's wave may have shifted lines).

One mechanical-cleanup wave; suitable for `plan-split-dispatch` with mostly junior chunks.
Group by package:

## Farm sim-core
- **Crop-quality bookkeeping drift** (item 28): `moveNormalQuality` + mill processing
  decrement `crops` but not `cropQuality` → phantom quality tiers (festival wins, sale
  mispricing). Centralize a `debitCrop(inventory, crop, qty)` and route all debits through
  it. ⚠️ can move baseline.
- **Harbor `deliveryDay = tick/20`** (item 29): inject `ticksPerDay` like FestivalSystem.
- **Dead scaffolding** (item 30): `deliver-contract` paid no-op intent (empty handler, 3 AP)
  — remove the AP row + intent or implement; CNP contract-net (module-global registry
  survives `bootstrapSim`, tasks never reach `completed`) — delete or finish; decide once.
- **RNG/lifecycle hygiene** (item 31): ShopSlateSystem forks `"shop-slate"` instead of the
  raw rng (⚠️ baseline moves); auction settlement escrows at bid or falls back to runner-up
  instead of retrying forever; festival tie-break either uses its drawn rng or stops drawing
  it (⚠️ baseline); evict `EventFeedSystem.seen` + `settledAuctions`; fix the dead
  `hasGoods` ternary in `watering/harbor.ts:107`.
- **Snapshot module state** (item 32): `buildEvents` shared scratch array → fresh/pooled
  per-call; `defaultSpriteState` singleton → per-run construction (test hygiene).

## Citadel
- **ProductionSystem O(villagers × buildings) per tick** (item 33): build one
  `tileToBuildingId` map per tick (pattern in sim-bootstrap's `getBuildings`); precompute
  FireSystem's daily burning/wooden lists + firebreak lookup.
- **Client niggles** (item 34): `extendTrail` incremental Set; `boxBuilding` `noDoor`
  contract (implement the option or fix the stale doc); collapse duplicate `device.lost`
  handlers.
- **MP iso render window** (item 35) — EXCLUDED here; belongs to brief 108 (live-MP pass).

## Gates
Typecheck + tests green; Farm determinism MATCH ×3 (note which items moved the baseline);
Citadel determinism MATCH ×3; item 28/31 changes need red-before-fix tests.
