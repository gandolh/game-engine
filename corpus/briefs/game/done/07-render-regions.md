# Game Task 07 — Render the New World

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Fixed a coordinate-system split (tile coords in logic vs pixel coords in renderer) and rewrote the renderer to draw all 5 regions. Deleted the `decorate.ts` pixel-override shim.

## What shipped

- `render-systems.ts` rewritten: iterates every `(tx, ty)` in the 40×40 grid; `isWalkable && regionAt === null` → road (`tile/path`); farm regions → `tile/grass`; village → `tile/dirt`; void → no sprite. `TILE = 16` px per tile.
- Per-farm perimeter fences using `tile/fence-h`; road-entry tiles skipped so entries aren't visually blocked.
- Entity sprite rendering: `px = (prevX + (x - prevX) * alpha) * TILE + TILE/2` — tile→pixel conversion at draw time; `prevX/prevY` initialized to same tile coords as initial position.
- Camera: `worldUnitsX/Y = 640`, `centerX/Y = 320` (import `WORLD_WIDTH/HEIGHT` from `./world/regions`).
- `decorate.ts` deleted; its pixel-override of market-wall + shopkeeper transforms removed. All transforms are tile-based throughout.
- `ui/observer.ts` updated: new `region` column (`'home' | 'village' | 'traveling' | string`) derived from `farmer.currentRegion` + `farmer.path !== undefined`.
- `observer.test.ts` updated with snapshot assertion for the new region column.
- Decision: `walkable && regionAt === null` distinguishes road tiles from region tiles (roads are not inside any region's bounds).
