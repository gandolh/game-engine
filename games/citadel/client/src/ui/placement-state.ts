/**
 * Client-side placement UX state.
 *
 * Tracks which mode the player is in (none / placing / demolish / road / wall)
 * and the cursor tile position for ghost rendering. Runs on the main thread
 * only — no sim state here; it reads from the latest RenderSnapshot.
 */
import { checkPlacement, OccupancyGrid } from "@engine/core";
import type { Camera2D } from "@engine/core";
import { isWalkable, TerrainType, WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot } from "@citadel/sim-core";
import { eventToDevicePx, screenToTile, transformOf } from "../render/citadel-renderer";

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
): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return;
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

/** Search window margin (tiles) around the drag's bounding box for `routeRoadPath`. */
const ROUTE_MARGIN = 16;
/**
 * Per-turn penalty in the A* cost. Strictly < 1 so total path length still
 * dominates (a detour is never traded for a longer one just to save a turn),
 * but ties between equal-length routes prefer the one with fewer turns — so a
 * detour hugs straight lines and reads like the old L wherever it can.
 */
const TURN_PENALTY = 0.4;

const ROUTE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Obstacle-aware road path between two endpoints (4-connected grid).
 *
 * When the straight L from {@link shortestRoadPath} is unobstructed this returns
 * it unchanged, so simple drags look identical to before. When the L would clip
 * a building (or other un-roadable tile) this runs a bounded A* that routes
 * *around* the obstacle, staying connected end-to-end. The endpoints themselves
 * are always traversable (the sim is the source of truth for whether they're
 * legal); only interior tiles are checked. Returns `null` when no route exists
 * within the search window — the caller should fall back to the straight L and
 * surface a "no clear route" message rather than silently gapping. Pure;
 * exported for testing.
 */
export function routeRoadPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  isBlocked: TileBlockedFn,
): Array<{ x: number; y: number }> | null {
  const inBounds = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT;
  // Out-of-bounds endpoints can't seed a search; defer to the L (which clips
  // them) — matches today's behaviour for off-map drags.
  if (!inBounds(x0, y0) || !inBounds(x1, y1)) return shortestRoadPath(x0, y0, x1, y1);

  // Fast path: if the straight L's interior is clear, keep it verbatim.
  const l = shortestRoadPath(x0, y0, x1, y1);
  let clear = true;
  for (let i = 1; i < l.length - 1; i++) {
    if (isBlocked(l[i]!.x, l[i]!.y)) {
      clear = false;
      break;
    }
  }
  if (clear) return l;

  // A* within a window around the endpoints (keeps a long drag cheap).
  const minX = Math.max(0, Math.min(x0, x1) - ROUTE_MARGIN);
  const maxX = Math.min(WORLD_WIDTH - 1, Math.max(x0, x1) + ROUTE_MARGIN);
  const minY = Math.max(0, Math.min(y0, y1) - ROUTE_MARGIN);
  const maxY = Math.min(WORLD_HEIGHT - 1, Math.max(y0, y1) + ROUTE_MARGIN);

  const key = (x: number, y: number): number => y * WORLD_WIDTH + x;
  const startK = key(x0, y0);
  const goalK = key(x1, y1);
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const dirOf = new Map<number, number>(); // direction index used to arrive
  gScore.set(startK, 0);
  dirOf.set(startK, -1);

  // Minimal binary min-heap keyed by f-score.
  const heapF: number[] = [];
  const heapN: number[] = [];
  const heapPush = (f: number, n: number): void => {
    heapF.push(f);
    heapN.push(n);
    let i = heapF.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p]! <= heapF[i]!) break;
      [heapF[p], heapF[i]] = [heapF[i]!, heapF[p]!];
      [heapN[p], heapN[i]] = [heapN[i]!, heapN[p]!];
      i = p;
    }
  };
  const heapPop = (): number => {
    const top = heapN[0]!;
    const lastF = heapF.pop()!;
    const lastN = heapN.pop()!;
    if (heapF.length > 0) {
      heapF[0] = lastF;
      heapN[0] = lastN;
      let i = 0;
      const len = heapF.length;
      for (;;) {
        const lft = 2 * i + 1;
        const rgt = 2 * i + 2;
        let s = i;
        if (lft < len && heapF[lft]! < heapF[s]!) s = lft;
        if (rgt < len && heapF[rgt]! < heapF[s]!) s = rgt;
        if (s === i) break;
        [heapF[s], heapF[i]] = [heapF[i]!, heapF[s]!];
        [heapN[s], heapN[i]] = [heapN[i]!, heapN[s]!];
        i = s;
      }
    }
    return top;
  };

  const heuristic = (x: number, y: number): number => Math.abs(x - x1) + Math.abs(y - y1);
  heapPush(heuristic(x0, y0), startK);

  while (heapF.length > 0) {
    const u = heapPop();
    if (u === goalK) {
      // Reconstruct.
      const path: Array<{ x: number; y: number }> = [];
      let cur: number | undefined = goalK;
      while (cur !== undefined) {
        path.push({ x: cur % WORLD_WIDTH, y: Math.floor(cur / WORLD_WIDTH) });
        cur = cameFrom.get(cur);
      }
      path.reverse();
      return path;
    }
    const ux = u % WORLD_WIDTH;
    const uy = Math.floor(u / WORLD_WIDTH);
    const ug = gScore.get(u)!;
    const udir = dirOf.get(u)!;
    for (let d = 0; d < ROUTE_DIRS.length; d++) {
      const nx = ux + ROUTE_DIRS[d]![0];
      const ny = uy + ROUTE_DIRS[d]![1];
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const nk = key(nx, ny);
      // The goal is always reachable even if it sits on a blocked tile (the sim
      // decides if the endpoint is legal); every interior tile must be clear.
      if (nk !== goalK && isBlocked(nx, ny)) continue;
      const turn = udir >= 0 && udir !== d ? TURN_PENALTY : 0;
      const tentative = ug + 1 + turn;
      const known = gScore.get(nk);
      if (known === undefined || tentative < known) {
        gScore.set(nk, tentative);
        cameFrom.set(nk, u);
        dirOf.set(nk, d);
        heapPush(tentative + heuristic(nx, ny), nk);
      }
    }
  }
  return null;
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
  /** Tiles of the shortest path from the drag start to the cursor. */
  private _dragTiles: Array<{ x: number; y: number }> = [];
  /**
   * True when the last road recompute could find no clear route and fell back
   * to the straight L (which the sim will gap). Drives a "no clear route" toast.
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
  // A road is defined by two endpoints: the tile under the cursor when the
  // drag began, and the tile under the cursor now. The painted tiles are the
  // shortest grid path between them (recomputed on every cursor move), not an
  // accumulation of every tile the mouse happened to pass over.
  startRoadDrag(): void {
    this._dragging = true;
    this._dragStartX = this._cursorTileX;
    this._dragStartY = this._cursorTileY;
    this._recomputePath();
  }

  continueRoadDrag(): void {
    if (!this._dragging) return;
    this._recomputePath();
  }

  /** End the drag and return the path tiles. */
  endRoadDrag(): Array<{ x: number; y: number }> {
    this._dragging = false;
    const tiles = this._dragTiles;
    this._dragTiles = [];
    return tiles;
  }

  get isDraggingRoad(): boolean {
    return this._dragging;
  }

  get roadTiles(): ReadonlyArray<{ x: number; y: number }> {
    return this._dragTiles;
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
   * Recompute the drag path from the start to the cursor. Roads route *around*
   * building footprints and un-roadable terrain (water decks into a bridge, so
   * it stays passable); walls keep the deliberate straight L (a wall is placed
   * *on* a perimeter, not routed around it).
   */
  private _recomputePath(): void {
    if (this.mode === "road" && this._terrain !== null) {
      const isBlocked = this._blockedForRoad(this._terrain, this._buildings);
      const routed = routeRoadPath(
        this._dragStartX,
        this._dragStartY,
        this._cursorTileX,
        this._cursorTileY,
        isBlocked,
      );
      if (routed !== null) {
        this._dragTiles = routed;
        this._routeBlocked = false;
        return;
      }
      // No clear route — fall back to the straight L and flag it.
      this._routeBlocked = true;
    } else {
      this._routeBlocked = false;
    }
    this._dragTiles = shortestRoadPath(
      this._dragStartX,
      this._dragStartY,
      this._cursorTileX,
      this._cursorTileY,
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
          if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) continue;
          occupied.add(ty * WORLD_WIDTH + tx);
        }
      }
    }
    return (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return true;
      if (occupied.has(y * WORLD_WIDTH + x)) return true;
      // Water is passable — a road tile on water auto-decks into a bridge.
      if (terrain.cells[y * WORLD_WIDTH + x] === TerrainType.Water) return false;
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
    terrain: TerrainGrid,
    buildings: readonly BuildingSnapshot[],
  ): void {
    // Derive the tile under the cursor from the SAME transform the WebGPU
    // renderer uses (Camera2D + canvas backing-store size). `eventToDevicePx`
    // applies the renderer's dpr clamp; `screenToTile` inverts the GPU
    // world→screen transform. See render/citadel-renderer.ts.
    const { sx, sy } = eventToDevicePx(e, canvas);
    const t = transformOf(camera, canvas.width, canvas.height);
    const { tx, ty } = screenToTile(t, sx, sy);
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
    const occ = new OccupancyGrid(WORLD_WIDTH, WORLD_HEIGHT);
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
        if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) continue;
        if (terrain.cells[ty * WORLD_WIDTH + tx] === want) return true;
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
