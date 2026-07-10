/**
 * Client-side placement UX state.
 *
 * Tracks which mode the player is in (none / placing / demolish / road / wall)
 * and the cursor tile position for ghost rendering. Runs on the main thread
 * only — no sim state here; it reads from the latest RenderSnapshot.
 */
import { checkPlacement, OccupancyGrid } from "@engine/core";
import type { Camera2D } from "@engine/core";
import { isWalkable, TerrainType } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot } from "@citadel/sim-core";
import { eventToDevicePx, screenToTile, transformOf } from "../render/citadel-renderer";
import type { IsoProjection } from "../render/iso";

/** The runtime world extents these pure helpers bound + key against (brief 110).
 *  `TerrainGrid` satisfies it, so callers just pass the grid. */
export interface WorldDims {
  readonly width: number;
  readonly height: number;
}

export type PlacementMode = "none" | "place" | "demolish" | "road" | "wall" | "upgrade";

/**
 * Shortest grid path between two endpoints for road/wall drag-paint.
 *
 * On a 4-connected grid every monotone staircase between the endpoints has the
 * same (Manhattan) length, so we emit a single L-shaped path: run along the
 * axis with the larger delta first, then turn. Endpoints are integer tiles
 * (the cursor is floored to a tile); tiles outside the world are dropped and
 * the corner is deduped. Exported for testing.
 */
export function shortestRoadPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dims: WorldDims,
): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= dims.width || y >= dims.height) return;
    const last = tiles[tiles.length - 1];
    if (last && last.x === x && last.y === y) return;
    tiles.push({ x, y });
  };

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x1 >= x0 ? 1 : -1;
  const sy = y1 >= y0 ? 1 : -1;

  if (dx >= dy) {
    // Horizontal leg first, then vertical.
    for (let x = x0; x !== x1 + sx; x += sx) push(x, y0);
    for (let y = y0 + sy; y !== y1 + sy; y += sy) push(x1, y);
  } else {
    // Vertical leg first, then horizontal.
    for (let y = y0; y !== y1 + sy; y += sy) push(x0, y);
    for (let x = x0 + sx; x !== x1 + sx; x += sx) push(x, y1);
  }
  return tiles;
}

/**
 * Tile passability for road routing. Returns `true` if a road may NOT pass
 * through this tile. Building footprints (other than road/bridge/gate, which a
 * road may re-stamp harmlessly) and non-buildable terrain are blocked; water is
 * *passable* because a road tile on water auto-decks into a bridge.
 */
export type TileBlockedFn = (x: number, y: number) => boolean;

/**
 * Extend a freehand road trail toward a newly-entered tile (the cursor's
 * current tile), mutating `trail` in place. The trail is the sequence of tiles
 * the cursor has actually travelled through during the drag, kept contiguous
 * (consecutive tiles 4-adjacent) and free of duplicates.
 *
 * Three cases:
 *  - The tile is already the trail's tail → nothing to do (cursor hasn't left
 *    its tile).
 *  - The tile is somewhere earlier in the trail → the player has dragged back
 *    over the trail, so trim it back to that tile (Factorio-style erase).
 *  - Otherwise it's new → fill any gap between the old tail and the new tile
 *    with a short L connector (a fast drag / low frame rate can skip tiles), so
 *    the trail stays 4-connected, then the new tile becomes the tail.
 *
 * The connector is a *local* gap-fill between two consecutive samples — it is
 * NOT a global re-route between the drag's first and last tile. Out-of-world
 * tiles are dropped. Pure; exported for testing.
 *
 * Perf (review item 34): an optional `seen` set lets a caller that drives this
 * on every mousemove (see `PlacementStateManager`) maintain the "tiles on the
 * trail" index INCREMENTALLY across calls instead of rebuilding it from the
 * whole trail every time (was O(trail length) per call → O(n²) over a long
 * drag). This function keeps `seen` in sync with `trail` itself — adding on
 * every push, deleting on a drag-back trim — so callers only need to create it
 * once per drag and pass the same instance each call. When omitted (as in the
 * unit tests below), the old behavior is preserved exactly: a fresh set built
 * from `trail` each call.
 */
export function extendTrail(
  trail: Array<{ x: number; y: number }>,
  tx: number,
  ty: number,
  dims: WorldDims,
  seen?: Set<number>,
): void {
  if (tx < 0 || ty < 0 || tx >= dims.width || ty >= dims.height) return;
  if (trail.length === 0) {
    trail.push({ x: tx, y: ty });
    seen?.add(ty * dims.width + tx);
    return;
  }
  const tail = trail[trail.length - 1]!;
  if (tail.x === tx && tail.y === ty) return;

  // Drag-back: if the cursor re-entered a tile already on the trail, pop back to
  // it instead of branching. Trim `seen` to match (drop the entries for the
  // tiles being cut off) so it stays accurate for the next call.
  for (let i = trail.length - 2; i >= 0; i--) {
    if (trail[i]!.x === tx && trail[i]!.y === ty) {
      if (seen !== undefined) {
        for (let j = i + 1; j < trail.length; j++) {
          const t = trail[j]!;
          seen.delete(t.y * dims.width + t.x);
        }
      }
      trail.length = i + 1;
      return;
    }
  }

  // New tile — connect from the tail with the shortest L (covers the common
  // one-tile step and any gap a fast drag skipped). Skip the connector's first
  // tile (it's the tail, already present) and any tile already on the trail.
  const index = seen ?? new Set(trail.map((t) => t.y * dims.width + t.x));
  const connector = shortestRoadPath(tail.x, tail.y, tx, ty, dims);
  for (let i = 1; i < connector.length; i++) {
    const c = connector[i]!;
    const k = c.y * dims.width + c.x;
    if (index.has(k)) continue;
    index.add(k);
    trail.push({ x: c.x, y: c.y });
  }
}

export interface GhostState {
  tileX: number;
  tileY: number;
  w: number;
  h: number;
  valid: boolean;
}

export class PlacementStateManager {
  mode: PlacementMode = "none";
  /** Currently selected building type (when mode === "place") */
  selectedType = "house";
  /** Footprint dims for selected type */
  private _ghostW = 2;
  private _ghostH = 2;
  /** Whether selected type requires a forest tile (woodcutter). */
  private _requiresForest = false;
  /** Whether selected type requires a stone tile (quarry/mine). */
  private _requiresStone = false;

  private _cursorTileX = 0;
  private _cursorTileY = 0;
  private _ghostValid = false;

  /** Drag-paint state (shared by road + wall modes). */
  private _dragging = false;
  /** Tile where the current drag started (the road's first endpoint). */
  private _dragStartX = 0;
  private _dragStartY = 0;
  /**
   * The painted drag tiles. For roads this is the freehand trail of tiles the
   * cursor travelled through; for walls it's the straight L between the two
   * endpoints.
   */
  private _dragTiles: Array<{ x: number; y: number }> = [];
  /**
   * Incremental tile-index for {@link extendTrail} (freehand road drags only —
   * see item 34): mirrors `_dragTiles` as a `Set` keyed by tile index so each
   * mousemove extends it in O(1) rather than rebuilding it from the whole
   * trail. Reset alongside `_dragTiles` at drag start/end.
   */
  private _dragTilesSeen = new Set<number>();
  /**
   * True when the current drag can't be cleanly placed: for walls, the route
   * could find no clear path and fell back to the straight L; for roads, the
   * freehand trail crosses an un-roadable interior tile (the sim will gap it).
   * Drives a "no clear route" toast.
   */
  private _routeBlocked = false;

  /** Latest snapshot terrain/buildings, stashed so road drags can route around obstacles. */
  private _terrain: TerrainGrid | null = null;
  private _buildings: readonly BuildingSnapshot[] = [];

  /** Set the footprint size for the active selection */
  setFootprint(w: number, h: number): void {
    this._ghostW = w;
    this._ghostH = h;
  }

  setRequiresForest(req: boolean): void {
    this._requiresForest = req;
  }

  setRequiresStone(req: boolean): void {
    this._requiresStone = req;
  }

  // --- Drag-paint (road + wall) --------------------------------------------
  // ROADS are FREEHAND: the painted tiles are the sequence of tiles the cursor
  // actually travels through during the drag (accumulated via `extendTrail`),
  // so the player draws the road by hand and dragging back trims it. This
  // overrides the older "route an L/A* between the first and last tile" model.
  // WALLS keep the deliberate two-endpoint straight L (a wall is placed *on* a
  // perimeter, so a freehand wobble isn't wanted) — see `_recomputePath`.
  startRoadDrag(): void {
    this._dragging = true;
    this._dragStartX = this._cursorTileX;
    this._dragStartY = this._cursorTileY;
    this._dragTiles = [];
    this._dragTilesSeen.clear();
    this._routeBlocked = false;
    if (this.mode === "road") {
      if (this._terrain !== null) {
        extendTrail(this._dragTiles, this._cursorTileX, this._cursorTileY, this._terrain, this._dragTilesSeen);
      }
    } else {
      this._recomputePath();
    }
  }

  continueRoadDrag(): void {
    if (!this._dragging) return;
    if (this.mode === "road") {
      // Freehand: append the tile the cursor just entered (or trim on drag-back).
      // Passes the persistent `_dragTilesSeen` index so extendTrail updates it
      // incrementally instead of rebuilding it from the whole trail every move.
      if (this._terrain !== null) {
        extendTrail(this._dragTiles, this._cursorTileX, this._cursorTileY, this._terrain, this._dragTilesSeen);
      }
      // A freehand trail can still cross un-roadable tiles; flag whether any
      // interior tile is blocked so the caller can toast on release.
      this._routeBlocked = this._trailHasBlockedInterior();
      return;
    }
    this._recomputePath();
  }

  /**
   * Whether the current freehand trail has any blocked interior tile (a tile the
   * sim will reject for a road). Endpoints are excluded — the sim is the
   * authority on whether the drop tiles are legal. Mirrors the per-tile validity
   * rule used for the red/green preview.
   */
  private _trailHasBlockedInterior(): boolean {
    if (this._dragTiles.length < 3 || this._terrain === null) return false;
    const isBlocked = this._blockedForRoad(this._terrain, this._buildings);
    for (let i = 1; i < this._dragTiles.length - 1; i++) {
      const t = this._dragTiles[i]!;
      if (isBlocked(t.x, t.y)) return true;
    }
    return false;
  }

  /** End the drag and return the path tiles. */
  endRoadDrag(): Array<{ x: number; y: number }> {
    this._dragging = false;
    const tiles = this._dragTiles;
    this._dragTiles = [];
    this._dragTilesSeen.clear();
    return tiles;
  }

  get isDraggingRoad(): boolean {
    return this._dragging;
  }

  get roadTiles(): ReadonlyArray<{ x: number; y: number }> {
    return this._dragTiles;
  }

  /**
   * The current drag-paint tiles tagged with whether the sim will ACCEPT each
   * one, for the red/green preview tint. A tile is invalid if it's blocked for a
   * road (building footprint / un-roadable terrain) — except the two endpoints,
   * which the sim itself validates (so they stay green in the preview rather than
   * flashing red while the player is still choosing where to drop them). Walls
   * use the same passability rule. Pure read over the stashed terrain/buildings.
   */
  roadTilesWithValidity(): Array<{ x: number; y: number; valid: boolean }> {
    const tiles = this._dragTiles;
    if (tiles.length === 0 || this._terrain === null) {
      return tiles.map((t) => ({ x: t.x, y: t.y, valid: true }));
    }
    const isBlocked = this._blockedForRoad(this._terrain, this._buildings);
    const lastIdx = tiles.length - 1;
    return tiles.map((t, i) => {
      // Endpoints are the player's chosen drop tiles — the sim is the authority
      // on whether they're legal, so don't pre-flag them red mid-drag.
      const isEndpoint = i === 0 || i === lastIdx;
      return { x: t.x, y: t.y, valid: isEndpoint ? true : !isBlocked(t.x, t.y) };
    });
  }

  /**
   * Whether the most recent road drag could not be routed and fell back to a
   * straight L (the sim will gap it). Consumed by the caller on drag-end to
   * surface a "no clear road route" toast.
   */
  get lastRouteBlocked(): boolean {
    return this._routeBlocked;
  }

  /**
   * Recompute the WALL drag path: the deliberate straight L between the two
   * endpoints (a wall is placed *on* a perimeter, so it is not freehand and is
   * not routed around obstacles). Roads are freehand and never come through
   * here — they accumulate via `extendTrail` in {@link continueRoadDrag}.
   */
  private _recomputePath(): void {
    this._routeBlocked = false;
    if (this._terrain === null) return;
    this._dragTiles = shortestRoadPath(
      this._dragStartX,
      this._dragStartY,
      this._cursorTileX,
      this._cursorTileY,
      this._terrain,
    );
  }

  /** Build a road-passability predicate from the current snapshot. */
  private _blockedForRoad(
    terrain: TerrainGrid,
    buildings: readonly BuildingSnapshot[],
  ): TileBlockedFn {
    // Footprints a road may NOT cross. Roads/bridges/gates are re-stampable, so
    // they stay passable (chaining a new road through them is harmless).
    const occupied = new Set<number>();
    for (const b of buildings) {
      if (b.type === "road" || b.type === "bridge" || b.type === "gate") continue;
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          const tx = b.x + dx;
          const ty = b.y + dy;
          if (tx < 0 || ty < 0 || tx >= terrain.width || ty >= terrain.height) continue;
          occupied.add(ty * terrain.width + tx);
        }
      }
    }
    return (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= terrain.width || y >= terrain.height) return true;
      if (occupied.has(y * terrain.width + x)) return true;
      // Water is passable — a road tile on water auto-decks into a bridge.
      if (terrain.cells[y * terrain.width + x] === TerrainType.Water) return false;
      // Otherwise mirror the sim's buildable rule (grass/forest/stone ok; rough no).
      return !isWalkable(terrain, x, y);
    };
  }

  /**
   * Update cursor position from a mouse event.
   * Converts screen coords → tile coords using the camera transform.
   */
  updateCursor(
    e: MouseEvent,
    canvas: HTMLCanvasElement,
    camera: Camera2D,
    iso: IsoProjection,
    terrain: TerrainGrid,
    buildings: readonly BuildingSnapshot[],
  ): void {
    // Derive the tile under the cursor from the SAME transform the WebGPU
    // renderer uses (Camera2D + canvas backing-store size). `eventToDevicePx`
    // applies the renderer's dpr clamp; `screenToTile` inverts the GPU
    // world→screen transform. See render/citadel-renderer.ts.
    const { sx, sy } = eventToDevicePx(e, canvas);
    const t = transformOf(camera, canvas.width, canvas.height);
    const { tx, ty } = screenToTile(iso, t, sx, sy);
    this._cursorTileX = tx;
    this._cursorTileY = ty;
    // Stash for road routing (recompute reads these to detour around buildings).
    this._terrain = terrain;
    this._buildings = buildings;

    if (this.mode === "place") {
      this._ghostValid = this._checkValid(terrain, buildings);
    } else if ((this.mode === "road" || this.mode === "wall") && this._dragging) {
      this.continueRoadDrag();
    }
  }

  private _checkValid(terrain: TerrainGrid, buildings: readonly BuildingSnapshot[]): boolean {
    // Build a temporary occupancy grid from current snapshot buildings.
    // Gates stay walkable, so don't count them as occupancy for validation.
    const occ = new OccupancyGrid(terrain.width, terrain.height);
    for (const b of buildings) {
      if (b.type === "gate") continue;
      occ.apply({ x: b.x, y: b.y, w: b.w, h: b.h });
    }
    const buildable = (tx: number, ty: number): boolean =>
      isWalkable(terrain, tx, ty);
    const fp = {
      x: this._cursorTileX,
      y: this._cursorTileY,
      w: this._ghostW,
      h: this._ghostH,
    };
    if (!checkPlacement(fp, occ, buildable).valid) return false;

    if (this._requiresForest && !this._footprintHasTerrain(terrain, TerrainType.Forest)) return false;
    if (this._requiresStone && !this._footprintHasTerrain(terrain, TerrainType.Stone)) return false;
    return true;
  }

  private _footprintHasTerrain(terrain: TerrainGrid, want: TerrainType): boolean {
    for (let dy = 0; dy < this._ghostH; dy++) {
      for (let dx = 0; dx < this._ghostW; dx++) {
        const tx = this._cursorTileX + dx;
        const ty = this._cursorTileY + dy;
        if (tx < 0 || ty < 0 || tx >= terrain.width || ty >= terrain.height) continue;
        if (terrain.cells[ty * terrain.width + tx] === want) return true;
      }
    }
    return false;
  }

  ghost(): GhostState | null {
    if (this.mode !== "place") return null;
    return {
      tileX: this._cursorTileX,
      tileY: this._cursorTileY,
      w: this._ghostW,
      h: this._ghostH,
      valid: this._ghostValid,
    };
  }

  /** Returns the tile the cursor is over (for demolish mode). */
  cursorTile(): { tx: number; ty: number } {
    return { tx: this._cursorTileX, ty: this._cursorTileY };
  }
}
