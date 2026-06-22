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

  /** Recompute the shortest grid path from the drag start to the cursor. */
  private _recomputePath(): void {
    this._dragTiles = shortestRoadPath(
      this._dragStartX,
      this._dragStartY,
      this._cursorTileX,
      this._cursorTileY,
    );
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
