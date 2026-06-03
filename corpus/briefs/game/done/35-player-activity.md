# Game Brief 35 — Player Activity + Debug Player

## Status: Done (2026-06-03)

## Summary

Four mechanics added to make the simulation visually active and agents genuinely
traverse the map throughout the day. One debug-mode controllable player added for
walkability testing.

## Mechanics

### 1. Slower movement speed
`STEP_TICKS` increased from 5 → 8 (250ms → 400ms per tile, 4 → 2.5 tiles/sec).
Walking is now clearly visible. A village round-trip takes ~6s real time.

### 2. Action time cost (`busyUntilTick`)
Physical actions (plant/water/till/chop/mine) now consume real sim time based on
the farmer's best tool tier:

| Tier | Cost |
|---|---|
| wooden | 60 ticks (3s) |
| stone | 40 ticks (2s) |
| iron | 20 ticks (1s) |

`ActSystem` sets `farmer.farmer.busyUntilTick = ctx.tick + cost` after executing a
physical action batch. `PerceiveSystem` clears it when expired and re-arms deliberation,
so farmers visibly pause between work phases instead of batch-completing all actions in
one tick.

### 3. Home + sleep routine
- `HomeTag` entity (farmhouse sprite) spawned at bottom-right corner of each farm.
- `deliberateSleep(farmer)` added to all 4 personalities — called at the end of each
  deliberation with priority −1 (highest). During `evening` or `work` phase, queues
  `travel → homeRegion` so the farmer is home before night.
- Guarantees a full outward + return trip per day for every farmer, regardless of
  whether they have crops to sell.

### 4. Periodic market visits
`deliberatePeriodicMarketVisit(farmer, period=3, priority=6)` — all 4 personalities
visit the village every 3rd day to read market offers, even when they have no crops
to sell. Keeps road traffic steady between harvests.

### 5. Early village visit (day 0–1)
`deliberateEarlyVillageVisit` queues `travel → village + read-offers` on days 0 and 1
for every farmer. Gets the map busy from the very first tick.

## Debug player (`WASD`)

Render-side only — no ECS entity, no sim involvement.

- Spawns at village center (tile 19, 19).
- `WASD` or arrow keys: 1 tile per step, throttled to 120ms (8 steps/sec).
- `P` toggles visibility.
- Checks `isWalkable(newTile)` before every step — walls and void correctly block.
- Drawn as a bright cyan diamond (layer 200, always on top) with a ground shadow.
- `Keyboard` class attached to `window`; `keyboard.endFrame()` called each render tick.

`Keyboard` class (previously in `@engine/core/input` but not re-exported from the package
root) is now exported from `@engine/core` via `packages/engine/src/index.ts`.

## Key files
- `packages/farm-valley/src/systems/travel.ts` — `STEP_TICKS = 8`
- `packages/farm-valley/src/systems/act.ts` — `busyUntilTick` set after physical actions
- `packages/farm-valley/src/systems/perceive.ts` — clear `busyUntilTick`, re-arm deliberation
- `packages/farm-valley/src/agents/watering.ts` — `deliberateSleep`, `deliberatePeriodicMarketVisit`
- `packages/farm-valley/src/main.ts` — debug player state + WASD render loop
- `packages/engine/src/index.ts` — exports `Keyboard` from `./input`
