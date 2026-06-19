/**
 * Client-side placement UX state.
 *
 * Tracks which mode the player is in (none / placing / demolish / road / wall)
 * and the cursor tile position for ghost rendering. Runs on the main thread
 * only — no sim state here; it reads from the latest RenderSnapshot.
 */
import { checkPlacement, OccupancyGrid } from "@engine/core";
import { isWalkable, TerrainType, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot } from "@citadel/sim-core";
import type { Camera } from "../render/terrain-renderer";

export type PlacementMode = "none" | "place" | "demolish" | "road" | "wall";

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
  private readonly _dragTiles: Array<{ x: number; y: number }> = [];

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
  startRoadDrag(): void {
    this._dragging = true;
    this._dragTiles.length = 0;
    this._addDragTile(this._cursorTileX, this._cursorTileY);
  }

  continueRoadDrag(): void {
    if (!this._dragging) return;
    this._addDragTile(this._cursorTileX, this._cursorTileY);
  }

  /** End the drag and return the painted tiles (deduped). */
  endRoadDrag(): Array<{ x: number; y: number }> {
    this._dragging = false;
    const tiles = this._dragTiles.slice();
    this._dragTiles.length = 0;
    return tiles;
  }

  get isDraggingRoad(): boolean {
    return this._dragging;
  }

  get roadTiles(): ReadonlyArray<{ x: number; y: number }> {
    return this._dragTiles;
  }

  private _addDragTile(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return;
    if (this._dragTiles.some((t) => t.x === x && t.y === y)) return;
    this._dragTiles.push({ x, y });
  }

  /**
   * Update cursor position from a mouse event.
   * Converts screen coords → tile coords using the camera transform.
   */
  updateCursor(
    e: MouseEvent,
    canvas: HTMLCanvasElement,
    camera: Camera,
    terrain: TerrainGrid,
    buildings: readonly BuildingSnapshot[],
  ): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(canvas.clientHeight * dpr));

    const WORLD_PX_W = WORLD_WIDTH * TILE_SIZE;
    const WORLD_PX_H = WORLD_HEIGHT * TILE_SIZE;
    const baseSx = cw / WORLD_PX_W;
    const baseSy = ch / WORLD_PX_H;
    const baseS = Math.min(baseSx, baseSy);
    const s = baseS * camera.zoom;
    const originX = cw / 2 - camera.centerX * s;
    const originY = ch / 2 - camera.centerY * s;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * dpr;
    const mouseY = (e.clientY - rect.top) * dpr;

    const worldX = (mouseX - originX) / s;
    const worldY = (mouseY - originY) / s;

    this._cursorTileX = Math.floor(worldX / TILE_SIZE);
    this._cursorTileY = Math.floor(worldY / TILE_SIZE);

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
