# Game Task 07 — Render the New World

## Context

Briefs 05 + 06 restructured the world into a 40×40 tile grid with 5 regions (4 farms N/E/S/W around a village), but the renderer still draws the pre-split layout: a 20×12 grass field with hardcoded paths and 4 fences ([packages/farm-valley/src/render-systems.ts](../../../../packages/farm-valley/src/render-systems.ts)). The game runs and the logic is correct, but visually nothing has changed — the village + farms are invisible.

Worse, there's a **coordinate-system split**:
- `setupRegions` stamps `Transform { x, y }` in **tile** coordinates onto market-wall, shopkeeper, and farmers (e.g. (16, 16) tile, (20, 6) tile).
- The renderer reads `transform.x, transform.y` as **pixel** coordinates.
- [decorate.ts](../../../../packages/farm-valley/src/decorate.ts) papers over the difference for market-wall + shopkeeper only — by reassigning their transforms to hardcoded pixel coords (144, 88) / (176, 88). Farmers are not patched, so they currently render at tile-coord positions interpreted as pixels (i.e. clustered in the top-left ~20px square).

This brief fixes both: render the 40×40 world correctly, and unify on **tile coords for all logic** with a clear tile→pixel conversion at draw time.

## Goal

- Renderer draws the 5 regions + roads + plot grid + farmer sprites at correct positions.
- All entity `Transform.{x, y}` are in tile coordinates everywhere in the game.
- `decorate.ts` is deleted (no more pixel-coord overrides).
- Camera centered on the world, all 5 regions visible at once.
- Observer panel shows each farmer's current region (and "→ village" / "→ home" if traveling).

## Files you OWN

- `packages/farm-valley/src/render-systems.ts` (modify — rewrite the scene building) — owner
- `packages/farm-valley/src/main.ts` (modify — `CAMERA_CONFIG` constants + remove `decorateMarketAndShop` call) — owner
- `packages/farm-valley/src/decorate.ts` (DELETE) — owner
- `packages/farm-valley/src/ui/observer.ts` (modify — add region/traveling line per farmer) — owner
- `packages/farm-valley/src/ui/observer.test.ts` (modify — update snapshot expectations to include region) — owner
- `packages/farm-valley/src/world-setup.ts` and `world/region-setup.ts` (modify ONLY IF transforms are not in tile coords yet — read first; if already correct, leave alone) — owner

## Files you must NOT touch

- `packages/engine/**` — the renderer primitive (`Canvas2dRenderer.push`) is fine as-is, we just pass different sprites
- `packages/farm-valley/src/world/regions.ts`, `walkable-grid.ts`, `region-setup.ts` (except as noted above)
- `packages/farm-valley/src/systems/**`
- `packages/farm-valley/src/agents/**`
- `packages/farm-valley/src/protocols/**`
- `packages/farm-valley/src/components.ts`
- `tools/atlas-builder/**` — no new atlas frames; reuse existing `tile/grass`, `tile/path`, `tile/dirt`, `tile/fence-h`, `tile/dirt` (for plots), structure frames already in the atlas

## What to build

### Constants (top of `render-systems.ts`)

```ts
import { WORLD_WIDTH, WORLD_HEIGHT, REGIONS, isWalkable, regionAt } from "./world/regions";

const TILE = 16; // tile size in pixels
// Total render world: WORLD_WIDTH * TILE × WORLD_HEIGHT * TILE = 640 × 640
```

### Backdrop (replace the old `BACKGROUND` + `FENCES`)

Iterate every (tx, ty) in [0, WORLD_WIDTH) × [0, WORLD_HEIGHT):
- `isWalkable(tx, ty) === false` → void tile, do not emit a sprite (or emit a dark `tile/dirt` at layer 0 for visibility; pick one and document)
- For walkable tiles, switch on the region:
  - `farm-*` regions → `tile/grass` at layer 0
  - `village` region → `tile/dirt` at layer 0 (cobblestone-ish)
  - road tiles (walkable, `regionAt` returns `null` because roads aren't in any region's bounds — adjust if needed) → `tile/path` at layer 0

**Decision needed:** roads currently aren't inside any region's `bounds`. `regionAt` returns `null` for them. `isWalkable` returns `true`. Use this to distinguish: `walkable && regionAt === null` → road. (Sanity-check this assumption against `walkable-grid.ts` and `regions.ts` first.)

### Region perimeter fences

For each `farm-*` region, draw `tile/fence-h` along the top and bottom edges, and `tile/fence-h` rotated 90° along the left and right edges. Skip the road-facing tile so the entry isn't blocked visually. Layer 20.

Village does NOT get fences (open square in the middle of the map).

### Plot rendering

Existing code already iterates `world.query("plot")` and draws `tile/dirt` at `plot.tileX * TILE + TILE/2`. Keep this. After Brief 05 the `plot.tileX` / `tileY` are tile-coord inside the world. Confirm the draw position is correct (a plot at tile (15, 6) should draw at pixel (15*16+8, 6*16+8) = (248, 104)).

### Entity sprite rendering

Loop `world.query("sprite", "transform")`. Convert tile → pixel:

```ts
const px = (t.prevX + (t.x - t.prevX) * alpha) * TILE + TILE / 2;
const py = (t.prevY + (t.y - t.prevY) * alpha) * TILE + TILE / 2;
```

That's it — the only change is the `* TILE + TILE / 2` conversion (and matching `prevX`/`prevY`).

### Verify transform coordinate system

Before any of the above, **read `world-setup.ts` and `world/region-setup.ts`**. The senior subagent on Brief 05 set farmer `Transform.x, y` to "farm center" — confirm this is in tile units (e.g. farmer at farm-cora center should be at tile (~20, ~6), not pixel (~320, ~96)). If somehow it's pixel, fix `region-setup.ts` to use tile coords. Same for market-wall + shopkeeper.

`Transform.prevX, prevY` should be initialized to the same tile coords so the first render doesn't interpolate from (0, 0).

### Delete `decorate.ts`

Once transforms are correctly tile-coord-based and the renderer converts on draw, `decorate.ts`'s pixel-override is no longer needed. Delete the file, remove its import + call from `main.ts`.

### Camera config (`main.ts`)

```ts
const CAMERA_CONFIG = {
  worldUnitsX: WORLD_WIDTH * TILE,      // 640
  worldUnitsY: WORLD_HEIGHT * TILE,     // 640
  centerX: (WORLD_WIDTH * TILE) / 2,    // 320
  centerY: (WORLD_HEIGHT * TILE) / 2,   // 320
} as const;
```

(Import `WORLD_WIDTH`/`WORLD_HEIGHT` from `./world/regions`. Define a local `TILE = 16` or import a shared constant.)

### Observer panel update

Add a column showing each farmer's `currentRegion` (humanized: `farm-cora` → "home", `village` → "village", traveling = derived from `farmer.path !== undefined`).

Snapshot shape gains:
```ts
farmers: Array<{
  ...existing fields,
  region: 'home' | 'village' | 'traveling' | string;
}>;
```

`buildObserverSnapshot` in `main.ts` reads `farmer.currentRegion` + `farmer.path` and computes `region`. The observer panel adds a single column for it.

Update `observer.test.ts` to assert the new column exists and reflects the snapshot.

## Tests

- The brief is render-heavy; existing tests should still pass.
- Add one snapshot-style assertion in observer.test.ts for the new region column.
- Manual verification: `npm run dev`, click Start, see 5 distinct regions and farmers moving between them.

## Acceptance criteria

- `npm run typecheck` passes
- `npm run test` passes for all workspaces (no regressions)
- `npm run dev` shows: a 640×640 game world with 4 farms (grass + perimeter fences) at compass positions, a village center (dirt), 4 roads connecting them. Plots visible inside each farm. 4 farmers at their farm centers. Market wall + shopkeeper visible in the village.
- After a few seconds, farmers visibly walk toward the village along the roads (because their personalities are now prepending `travel → village` intents and the pathfinder is wired in).
- `decorate.ts` is gone; `main.ts` no longer imports or calls it.

## Difficulty & subagent split

**MEDIUM-LIGHT.** One coherent slice, mostly mechanical. Atlas frames already exist. The trickiest part is verifying/fixing the tile-vs-pixel coord system across world-setup + region-setup if anything's still in pixel coords.

Recommended: **one senior (opus) subagent** for the whole slice — too coupled to split. The render-systems rewrite, the coord-system unification, `decorate.ts` removal, and `main.ts` camera config all hinge on the same decision (everything in tile coords) and benefit from being done together.

## Out of scope (next briefs)

- Tile-batched draw call (perf optimization — only if framerate suffers)
- Per-farm color tint to distinguish personalities (could be a polish brief)
- Path indicator (highlighting the path tiles a farmer is walking)
- Animated walking sprites (current sprites snap between tiles every STEP_TICKS=5)
- Drawing the daily shop slate as a billboard in the village
- MEET indicator (e.g. speech bubble between co-located farmers)
