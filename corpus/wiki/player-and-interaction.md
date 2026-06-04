# Player (Pip) & Interaction Systems

How the keyboard-controlled 5th farmer **Pip** works, plus the interaction/visual systems added alongside it (hotbar, hover tooltips, feature collision, bridges). This is the synthesis of the post-brief-35 work that previously lived only in session memory. As of 2026-06-04.

Verify before quoting — this page names specific files/functions; grep them if you're about to act on a claim (see [CLAUDE.md](../CLAUDE.md) → *Verifying before quoting the wiki*).

## Pip — a real farmer driven by input

Pip is a normal farmer **entity** in the sim worker with the same components as the four AI farmers, so crop-growth / harvest / market / render / animation all treat it identically. The only difference is the *source of its intentions*: keyboard input instead of an AI personality.

- Tagged by `personality.kind: "pip"` **and** a `player: { isPlayer, facing, pendingMove, pendingAction, selectedSlot }` component ([components.ts](../../packages/farm-valley/src/components.ts)).
- [`PlayerControlSystem`](../../packages/farm-valley/src/systems/player-control.ts) runs right before `ActSystem`: it moves Pip one tile/tick (walkability-checked, syncs `currentRegion` via `regionAt`) and, on an action key, builds the **same `Intention` shapes the AI emits** (`till`/`plant`/`water`/`chop-tree`/`mine-stone`) so `ActSystem` runs them unchanged. `DeliberateSystem` skips any entity with a `player` tag. **Player movement is NOT AP-gated** (free tile-by-tile walking for responsiveness); the action itself still flows through `ActSystem`'s AP/tool/proximity rules.
- `farmer.movedThisTick` flag exists so the render walk-cycle animates Pip even though it has no pathfinder `path`.

### Input plumbing
`WorkerInputMsg { move, action, selectSlot }` → `SimClient.sendInput()` → worker `applyInput` buffers the values onto the player entity, consumed/cleared by `PlayerControlSystem` each tick. Controls: **WASD/arrows** move, **Space** (or **E**) = action, **number keys 1–7** select a hotbar slot. Pause was moved off Space to **P** to free Space for the action; the old `1/2/4` speed hotkeys were removed (number keys now belong to the hotbar) — speed is set via the sidebar buttons.

### Pip's sprite
`pip` is a `PERSONALITY_SUBS` entry in [atlas-builder recipes.ts](../../tools/atlas-builder/src/recipes.ts) (gold hair `y→o`, green tunic `r→G`) which auto-generates the action + facing frames; a small extra block makes the 3 down-base frames. Rebuild with `npm run atlas`.

**Player facing is authoritative, not movement-delta.** For AI farmers, snapshot facing is derived from `t.x - t.prevX` (`resolveFacing`, 3-way side/up/down + flipX). That heuristic snaps Pip back to "down" the instant it stops between key presses, so for the player entity [`buildSprites`](../../packages/farm-valley/src/worker/snapshot-builder.ts) maps the authoritative 4-way `player.facing` directly: left/right → `"side"` + `flipX` (flip on left), up/down as-is. `resolveFrameAndBob` ([render-systems.ts](../../packages/farm-valley/src/render-systems.ts)) then builds `base + dirSeg + walkSuffix`; the `farmer/pip/side`, `/up`, and directional walk frames all exist in the atlas.

## Hotbar — slot-based action dispatch

The action key uses the **selected hotbar slot**, not an auto-by-context guess. [`HOTBAR_SLOTS`](../../packages/farm-valley/src/systems/player-control.ts) is the single source of truth, shared by sim dispatch, the `PlayerHotbar` snapshot field, and [ui/hotbar.ts](../../packages/farm-valley/src/ui/hotbar.ts):

| Slot | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| | Can | Hoe | Axe | Pickaxe | Radish | Wheat | Pumpkin |

`player.selectedSlot` decides what Space does on the faced tile (hoe→till, axe→chop, pickaxe→mine, can→water, seed→plant that crop). Selection lives in the sim and flows out through the snapshot, so the UI panel is a pure reflection (highlights the active slot, dims out-of-stock seeds).

## Hover tooltips — name + description

[`updateTooltip`](../../packages/farm-valley/src/main.ts) renders the nearest labeled sprite's `label` (bold) + `description` (wrapped) within half-a-tile of the cursor. The snapshot builder sets both fields for farmers, all structures/NPCs, fountains, farmhouses, **trees, stones, and crops** (crops include live growth/water state). A sprite with `label === null` is not hover-able.

## Feature collision — trees/stones block movement

`tileFeature` entities (trees/stones) are dynamic (spawn daily, despawn on chop/mine), so the static [`buildWalkableGrid()`](../../packages/farm-valley/src/world/walkable-grid.ts) (regions + roads only) doesn't know about them. [`FeatureCollisionSystem`](../../packages/farm-valley/src/systems/feature-collision.ts) holds the immutable base grid and each tick re-ORs blocked cells for the current feature tiles onto the **shared** `PathfinderGrid` that `TravelSystem` pathfinds over — so AI farmers route around features (and still stand *adjacent* to chop/mine, via `TravelSystem.resolveReachableTile`). It is registered right before `TravelSystem` in [sim-bootstrap.ts](../../packages/farm-valley/src/sim-bootstrap.ts), after `TileFeatureSystem`/`HarvestSystem`. The player blocks moves onto feature tiles separately via `PlayerControlSystem.featureAt(tx,ty)`, since it walks by `isWalkable` rather than the grid. Determinism is preserved (depends only on live feature entities).

## Bridges — styled island connectors

Road-only tiles (`regionAt(x,y) === null`, walkable) that span water render as a plank bridge (`tile/bridge-h`, authored horizontal, rotated 90° for vertical spans) instead of `tile/path`. [`computeBridges()`](../../packages/farm-valley/src/render-systems.ts) finds them in two passes: (1) road tiles directly touching ocean; (2) a fixpoint fill of road tiles flanked on an axis by ocean-or-deck, which decks the interior of 2-wide spans. A bridge tile's backdrop is `tile/ocean` with the plank overlay on layer 3 (above shore=1, below fences=20); `BRIDGE_SET` lets `backdropFrame` suppress the dirt path on those tiles.

## Craft-NPC idle pose (blacksmith/carpenter)

`WorkNpc` entities ([systems/work-npc.ts](../../packages/farm-valley/src/systems/work-npc.ts)) carry an `idlePose` (e.g. `npc/blacksmith/idle`) used while walking between stations **and** at any station whose `pose` is null (e.g. the oven). Previously such stations set `poseFrame = null`, and the snapshot builder's `frame = poseFrame ?? s.frame` fell back to the `structure/blacksmith` *building* sprite — so the smith visibly "became the building" at the oven. The fix is to always assign a person frame.

## Plot layout

Farms lay out plots in a grid via `PLOT_OFFSETS` in [world/region-setup.ts](../../packages/farm-valley/src/world/region-setup.ts) (currently `[-2, 1]` → a 2×2 grid spaced ≥2 empty cells apart). Pip starts standing on its first plot tile (`center + PLOT_OFFSETS[0]` on both axes), not the bare farm center — gated on `farmer.player`. Fences (`computeFences` in render-systems.ts) sit on farm *perimeters* only, never on plot tiles.

## Archipelago layout (88×80) — every zone an isolated island

As of 2026-06-04 the world is a true **archipelago**: every zone is its own island ringed by ocean on all sides, and islands are connected **only** by 2-tile-wide bridges (road tiles in `ROADS` that span water — no land ever touches between islands). The map is **88×80**. Layout (see the bounds table + ROADS in [world/regions.ts](../../packages/farm-valley/src/world/regions.ts)):

- **Pip's farm is the top island** (top-center, 38–49 × 2–13).
- **The four AI farms sit in the four corners** to maximise travel: Cora NW, Atticus NE, Otto SW, Hannah SE.
- **Village is the central hub** (38–49 × 34–45); most bridges radiate from it. Craft islands flank it (carpentry W, blacksmith E). Resource zones, mill, wells and seasonal zones fill the rest. The bridge network is a tree rooted at the village (village → carpentry/blacksmith/Pip/mill; carpentry → west chain; blacksmith → east chain; each corner farm + well hangs off its nearest resource island).

The renderer needed **no structural change**: `backdropFrame` already paints non-walkable tiles as `tile/ocean`, `computeShores` foams land/ocean borders, and `computeBridges` decks any road-only tile touching ocean. So the whole archipelago is driven purely from the region bounds + `ROADS`. There is no longer any plain `tile/path` — every road spans water and renders as a bridge.

> **GOTCHA (still live):** there are **two** `PERSONALITY_TO_REGION` maps — one in [world-setup.ts](../../packages/farm-valley/src/world-setup.ts) and one in [world/region-setup.ts](../../packages/farm-valley/src/world/region-setup.ts). Both must list `pip: "farm-pip"` or Pip gets no plots/fountain/home (only `region-setup` builds those, and only for mapped farmers).

Hardcoded coordinates that move with the layout: `BLACKSMITH_TILE`, `MARKET_WALL_TILE`, `SHOPKEEPER_TILE` + forge/carpentry props & NPC stations (region-setup.ts), `FORGE_OVEN_TILE` (render-systems.ts), and `TOWN_SQUARE`/`AUCTION_PODIUM_TILE`/`NOTICE_BOARD_TILE` (regions.ts). The [walkable-grid](../../packages/farm-valley/src/world/walkable-grid.test.ts) test asserts `EXPECTED_WALKABLE = 1849` **and** runs a BFS-from-village reachability guard over every region center (catches a stranded island). Layout-coordinate tests (`regions` / `walkable-grid` / `new-mechanics` / `render-systems`) assert specific tiles and must be updated together; most other tests use `getRegion(id).center` and are layout-agnostic.

> **Pre-existing churn (not a layout bug):** the headless sim logs many `[travel] no path … to region 'undefined' … dropping intent` warnings — a farmer re-pathing to a feature *tile* it can't stand adjacent to. This predates the archipelago (old 52×40 map logged a comparable count) and is benign: the determinism check still passes and the sim runs all 100 days.
