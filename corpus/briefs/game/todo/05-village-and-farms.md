# Game Task 05 — Village, Per-Farmer Farms, Travel

## Context

Farm Valley is currently spatially flat — there's one world, plots float free, the market wall and shopkeeper exist as logical entities anyone can address from anywhere. This brief restructures the world into **5 named regions** in a compass layout and adds **physical travel between them**, powered by the existing WASM pathfinder (which is loaded but unused — [main.ts:77](../../../../packages/farm-valley/src/main.ts#L77)).

This is the foundation. It's purely structural — no gameplay rules change yet. Brief 06 will layer in "must be at village to post offers" and the shop's daily slate.

## Goal

- 5 region entities: `village` + 4 farms (`farm-cora`, `farm-atticus`, `farm-hannah`, `farm-otto`)
- Compass layout: Cora N, Atticus E, Hannah S, Otto W, village in the middle
- Roads connecting each farm to the village (no direct farm-to-farm roads)
- Plots belong to a farmer's farm
- Walkable grid + pathfinder integration
- New `travel` intent kind + `TravelSystem` that moves farmers tile-by-tile

## Files you OWN

- `packages/farm-valley/src/world/regions.ts` (create) — region definitions, IDs, layout constants
- `packages/farm-valley/src/world/region-setup.ts` (create) — spawns region entities + plots-per-farm + village fixtures
- `packages/farm-valley/src/world/walkable-grid.ts` (create) — builds the global walkable grid for the pathfinder
- `packages/farm-valley/src/systems/travel.ts` (create) — TravelSystem
- `packages/farm-valley/src/components.ts` (modify — additive only) — add `Farmer.currentRegion`, `Farmer.path?`, `Plot.ownerId`, `Plot.regionId`
- `packages/farm-valley/src/world-setup.ts` (modify — replace the flat plot spawn with per-farm spawning via `region-setup.ts`)
- Tests: `regions.test.ts`, `walkable-grid.test.ts`, `travel.test.ts` next to each source file

## Files you must NOT touch

- `packages/engine/**` (pathfinder lives here, just consume it)
- `packages/farm-valley/src/agents/{conservative,aggressive,hoarder,opportunist}.ts` — personalities stay as today; Brief 06 updates them to plan trips
- `packages/farm-valley/src/systems/{perceive,deliberate,act,finish-day,harvest,inbox-dispatch,market,shopkeeper,auction,weather,crop-growth,ap}.ts` — read-only
- `packages/farm-valley/src/main.ts` — orchestrator wires `TravelSystem` in
- `packages/farm-valley/src/protocols/**`
- `packages/farm-valley/src/ui/**` — observer panel update is a follow-on
- Renderer in `packages/engine/src/render/` — the visual representation of regions is a separate integration step after this brief lands

## World layout

All coordinates are tile-based. Tile size is a render concern; this brief is grid-only.

```
Constants (in regions.ts):
  FARM_SIZE     = 12   // 12×12 tiles per farm
  VILLAGE_SIZE  = 12   // 12×12 village
  ROAD_LEN      = 4    // tiles of road between farm edge and village edge
  ROAD_WIDTH    = 2

World grid is 40×40 with (0,0) at top-left:
  Village:        x ∈ [14..25],   y ∈ [14..25]
  Farm North:     x ∈ [14..25],   y ∈ [0..11]    → Cora (conservative)
  Farm East:      x ∈ [28..39],   y ∈ [14..25]   → Atticus (aggressive)
  Farm South:     x ∈ [14..25],   y ∈ [28..39]   → Hannah (hoarder)
  Farm West:      x ∈ [0..11],    y ∈ [14..25]   → Otto (opportunist)
  Roads (walkable corridors connecting farm edge to village edge):
    North road:   x ∈ [18..21],   y ∈ [12..13]
    East road:    x ∈ [26..27],   y ∈ [18..21]
    South road:   x ∈ [18..21],   y ∈ [26..27]
    West road:    x ∈ [12..13],   y ∈ [18..21]
  Everything else: blocked ("void" — not walkable)
```

Town square is the inner 4×4 of the village (`x ∈ [18..21], y ∈ [18..21]`). Mark it on the village region for Brief 06 to use as the "meeting" sub-area.

## What to build

### `regions.ts`

```ts
export type RegionId = 'village' | 'farm-cora' | 'farm-atticus' | 'farm-hannah' | 'farm-otto';
export type RegionKind = 'village' | 'farm';

export interface RegionDef {
  id: RegionId;
  kind: RegionKind;
  ownerId?: number;          // farmer entity id for farms; undefined for village
  bounds: { minX: number; minY: number; maxX: number; maxY: number }; // inclusive
  center: { x: number; y: number };
}

export const REGIONS: readonly RegionDef[];   // built from the constants above
export const WORLD_WIDTH: number;             // 40
export const WORLD_HEIGHT: number;            // 40
export function regionAt(x: number, y: number): RegionId | null;
export function isWalkable(x: number, y: number): boolean;
export function getRegion(id: RegionId): RegionDef;
```

Compass direction of each farm relative to village is implicit in `bounds`. Personality-to-farm assignment is the constant above (Cora=N, Atticus=E, Hannah=S, Otto=W).

### `walkable-grid.ts`

```ts
import type { PathfinderGrid } from '@engine/core';

/** Build once at startup; the layout doesn't change at runtime. */
export function buildWalkableGrid(): PathfinderGrid;
```

Row-major `Uint8Array` of size `WORLD_WIDTH * WORLD_HEIGHT`. 0 = walkable, 1 = blocked. Walkable = any tile in any region's bounds (including roads). Blocked = void.

Plots are walkable — farmers walk on their own plots. The renderer / UI handles drawing them; the grid only encodes movement.

### `region-setup.ts`

```ts
import type { World } from '@engine/core';
import type { GameEntity } from '../components';

/** Spawn 5 region entities, lay out plots inside each farm, place village fixtures. */
export function setupRegions(world: World<GameEntity>, farmers: GameEntity[]): {
  regionEntities: Map<RegionId, GameEntity>;
  plotEntities: GameEntity[];
};
```

For each farm region:
- 9 plots in a 3×3 grid centered in the region
- Each plot gets `ownerId = farmer.id` and `regionId = farm-<farmer-name>`
- Plot tile coords are inside the farm's bounds

For the village:
- One market wall entity at a fixed village tile (e.g. (16, 16))
- One shopkeeper entity at a fixed village tile (e.g. (23, 23))
- Both get `Transform { x, y }` so they exist in world space

This **replaces** the current plot-spawning logic in `world-setup.ts`. Update `world-setup.ts` to call `setupRegions` after farmers are spawned.

### Component additions (`components.ts`)

Strictly additive — do not change existing fields.

```ts
// On Farmer:
currentRegion: RegionId;
path?: {
  waypoints: ReadonlyArray<{ x: number; y: number }>;
  nextIndex: number;       // index of the next waypoint to step onto
  ticksUntilStep: number;  // countdown to next tile step
};

// On Plot:
ownerId: number;            // farmer entity id
regionId: RegionId;
```

Initialize `currentRegion` to the farmer's own farm. Initial `Transform` of each farmer should be inside their farm bounds (e.g. the center tile).

### `TravelSystem` (`travel.ts`)

```ts
import type { System, World, Pathfinder } from '@engine/core';
import type { GameEntity } from '../components';
import type { PathfinderGrid } from '@engine/core';

export class TravelSystem implements System {
  constructor(
    private world: World<GameEntity>,
    private pathfinder: Pathfinder,
    private grid: PathfinderGrid,
  );
  step(stepMs: number): void;
}
```

New intent kind: `travel` with payload `{ targetRegionId: RegionId }`.

Per tick, for each farmer in state `ACT` (or whatever state runs intents — match existing convention):
1. If the farmer has a `travel` intent at the front of `intentions.queue` and `farmer.path` is null:
   - Compute path: `pathfinder.findPath(grid, farmer.transform, regionCenter(target))`
   - If empty: drop the intent, log a warning.
   - Else: store as `farmer.path` with `nextIndex = 0`, `ticksUntilStep = STEP_TICKS` (constant, default 5 = 4 tiles/sec at 20Hz)
2. If `farmer.path` is set:
   - Decrement `ticksUntilStep`. When it hits 0, advance: `transform = path.waypoints[path.nextIndex]`, `nextIndex++`, reset countdown.
   - When `nextIndex >= path.waypoints.length`:
     - Set `farmer.currentRegion = regionAt(transform.x, transform.y)`
     - Clear `farmer.path`
     - Pop the `travel` intent from `intentions.queue`
     - Emit `ONT_TRAVEL.ARRIVED` on the bus with body `{ farmerId, regionId }` so other systems (perceive, Brief 06) can react

Add the new ontology and body type as part of this brief: create `packages/farm-valley/src/protocols/travel.ts`. (Yes, I said don't touch `protocols/` — exception for this single new file. Don't touch the existing protocol files.)

### AP cost

Update `AP_COST` in [packages/farm-valley/src/systems/ap.ts](../../../../packages/farm-valley/src/systems/ap.ts) — wait, that's in the do-not-touch list. **Workaround:** leave `travel` at its existing AP cost (2). Travel duration is measured in ticks, not AP. AP cost is paid once per `travel` intent regardless of distance, just like every other intent. Brief 06 may revisit.

## Tests

- `regions.test.ts`:
  - `regionAt` returns the right id for points inside each region and inside roads
  - `regionAt` returns `null` for void tiles
  - `isWalkable` matches `regionAt !== null`
- `walkable-grid.test.ts`:
  - grid size is `WORLD_WIDTH * WORLD_HEIGHT`
  - Spot-check: village center is walkable, void corner (0,0) is blocked, road tiles are walkable
  - Total walkable count matches the expected sum (4 farms × 144 + village × 144 + 4 roads × 8 = 728)
- `travel.test.ts`:
  - Travel intent from Cora's farm to village center: path is computed, farmer advances tile-by-tile, on arrival `currentRegion` updates and `ARRIVED` is emitted
  - Travel to unreachable region (force-block grid for the test): intent dropped, warning logged
  - Travel into the same region the farmer is already in: arrives instantly (zero-length path is acceptable; document the behavior either way)

Use a real `Pathfinder` instance compiled from the committed wasm artifact in tests — Vitest in `farm-valley` already runs in jsdom; `createPathfinderFromBytes` works with `fs.readFileSync` on the wasm file at test time.

## Acceptance criteria

- `npm run typecheck` passes for `farm-valley`
- `npm run test -w farm-valley` passes for all new and existing tests (no regressions)
- `npm run dev` still boots without errors (game may look identical until the renderer integration follows — that's fine; check the observer panel still works)
- No `.js` import suffixes
- No new runtime deps

## Difficulty & subagent split

**MIXED**. Region constants + walkable grid are mechanical (junior). TravelSystem has subtle interactions with the intent queue and FSM (senior). Tests for travel determinism are mid-difficulty.

Recommended split:
- **Junior** (sonnet): `regions.ts`, `walkable-grid.ts`, their tests, the additive component edits
- **Senior** (opus): `region-setup.ts`, `travel.ts`, `protocols/travel.ts`, `travel.test.ts`, and the `world-setup.ts` modification
- After both return, run typecheck + test, then verify the orchestrator integration step (wiring `TravelSystem` into `main.ts`).

## Out of scope (deferred to Brief 06 or later)

- Personalities planning trips before market actions
- Market presence requirement
- Peer-to-peer trade in town square / on visited farms
- Shopkeeper daily offer slate
- Renderer changes (drawing 5 regions and roads) — this is an orchestrator follow-up after Brief 05's logic lands
- Observer panel showing "Cora is traveling to village"
