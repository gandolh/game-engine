/**
 * Citadel 21 + 22 — render-window controller (wires the two pure cores into the
 * engine static-layer bake).
 *
 *  - 21 (render-window): on a large map, bake only the camera-centred tile
 *    window into a sub-region texture ({@link visibleTileWindow} +
 *    {@link windowRegion}) instead of the whole grid, so texture memory stays
 *    proportional to the viewport, not the logical grid.
 *  - 22 (incremental budget): re-bakes go through an {@link IncrementalQueue}
 *    drained at a per-frame budget, so a fast pan enqueues the freshest window
 *    (coalesced — only the latest matters) and re-bakes at most `budget` times
 *    per frame on the NEXT frame, never synchronously in the input handler.
 *
 * Small worlds (solo Citadel's 96×96) fall under the texel threshold and bake
 * the whole world ONCE at boot — byte-identical to the pre-windowing
 * `createCitadelRenderer`, and `update()` is a no-op. Only the 256×256 MP world
 * (brief 29) crosses the threshold and windows.
 *
 * Render-only; no determinism impact.
 */
import type { RendererLike, StaticRegion } from "@engine/core";
import type { TerrainGrid } from "@citadel/sim-core";
import { TILE_SIZE } from "@citadel/sim-core";
import { visibleTileWindow, type TileWindow } from "./render-window";
import { IncrementalQueue } from "./build-budget";
import { makeTerrainDecorate } from "./terrain-dither";

/** Tiles of margin baked beyond the viewport so a tile entering the screen edge
 *  is already on the texture before the next re-bake lands. */
export const WINDOW_PAD = 8;

/** Max windowed re-bakes drained per frame. A bake is atomic (one engine call),
 *  so 1 is the natural cap: the latest window is baked next frame, the pan
 *  itself stays synchronous-rebake-free. */
export const REBAKE_BUDGET = 1;

/** Bake the whole world in one texture below this texel area; window above it.
 *  2048² sits between solo's 1536² (96 tiles) and MP's 4096² (256 tiles). */
export const WINDOW_TEXEL_THRESHOLD = 2048 * 2048;

/** The minimal camera view the window math needs (structural — keeps this
 *  testable without a real Camera2D / GPU). Citadel's Camera2D satisfies it. */
export interface CameraView {
  centerX: number;
  centerY: number;
  worldUnitsX: number;
  worldUnitsY: number;
}

/** The world-px sub-region a tile window covers. */
export function windowRegion(w: TileWindow, tileSize = TILE_SIZE): StaticRegion {
  return {
    originX: w.minTx * tileSize,
    originY: w.minTy * tileSize,
    width: (w.maxTx - w.minTx + 1) * tileSize,
    height: (w.maxTy - w.minTy + 1) * tileSize,
  };
}

/** Stable key for queue dedup + change detection. */
export function windowKey(w: TileWindow): string {
  return `${w.minTx},${w.minTy},${w.maxTx},${w.maxTy}`;
}

/** Whether a world this big should window (vs bake whole). */
export function shouldWindow(worldPxW: number, worldPxH: number): boolean {
  return worldPxW * worldPxH > WINDOW_TEXEL_THRESHOLD;
}

export interface RenderWindowOptions {
  pad?: number;
  budget?: number;
  /** Force windowing on/off (tests). Default: derive from the world size. */
  windowed?: boolean;
}

export class RenderWindowController {
  private readonly renderer: RendererLike;
  private readonly terrain: TerrainGrid;
  private readonly worldTilesW: number;
  private readonly worldTilesH: number;
  private readonly worldPxW: number;
  private readonly worldPxH: number;
  private readonly pad: number;
  private readonly budget: number;
  private readonly queue = new IncrementalQueue<TileWindow>(windowKey);

  /** Whether this world windows (large) or bakes whole (small). */
  readonly windowed: boolean;

  private baked: TileWindow | null = null;

  constructor(renderer: RendererLike, terrain: TerrainGrid, opts: RenderWindowOptions = {}) {
    this.renderer = renderer;
    this.terrain = terrain;
    this.worldTilesW = terrain.width;
    this.worldTilesH = terrain.height;
    this.worldPxW = terrain.width * TILE_SIZE;
    this.worldPxH = terrain.height * TILE_SIZE;
    this.pad = opts.pad ?? WINDOW_PAD;
    this.budget = opts.budget ?? REBAKE_BUDGET;
    this.windowed = opts.windowed ?? shouldWindow(this.worldPxW, this.worldPxH);
  }

  /** The currently-baked window (or null before the first bake). */
  get bakedWindow(): TileWindow | null {
    return this.baked;
  }

  /** Pending re-bake count (for tests / diagnostics). */
  get pending(): number {
    return this.queue.size;
  }

  private currentWindow(camera: CameraView): TileWindow {
    // worldUnitsX/Y already incorporate zoom (fitCameraToCanvas divides by it),
    // so they ARE the visible world-px extent → pass zoom=1.
    return visibleTileWindow(
      camera.centerX,
      camera.centerY,
      camera.worldUnitsX,
      camera.worldUnitsY,
      1,
      TILE_SIZE,
      this.worldTilesW,
      this.worldTilesH,
      this.pad,
    );
  }

  private bakeWindow(w: TileWindow): void {
    this.renderer.bakeStaticLayer(
      [],
      this.worldPxW,
      this.worldPxH,
      makeTerrainDecorate(this.terrain, w),
      windowRegion(w),
    );
    this.baked = w;
  }

  /** Bake the initial static layer. Call once after creating the renderer. */
  bakeInitial(camera: CameraView): void {
    if (this.windowed) {
      this.bakeWindow(this.currentWindow(camera));
    } else {
      // Whole world, no region → identical to the pre-windowing bake.
      this.renderer.bakeStaticLayer(
        [],
        this.worldPxW,
        this.worldPxH,
        makeTerrainDecorate(this.terrain),
      );
      this.baked = { minTx: 0, minTy: 0, maxTx: this.worldTilesW - 1, maxTy: this.worldTilesH - 1 };
    }
  }

  /**
   * Per-frame: if the camera window moved, coalesce-enqueue the latest window
   * and drain up to `budget` re-bakes. No-op for whole-world (small) maps.
   * Returns true if a re-bake happened this frame.
   */
  update(camera: CameraView): boolean {
    if (!this.windowed) return false;
    const desired = this.currentWindow(camera);
    if (this.baked === null || windowKey(desired) !== windowKey(this.baked)) {
      if (!this.queue.has(desired)) {
        // Only the latest window matters — drop stale pending work.
        this.queue.clear();
        this.queue.enqueue(desired);
      }
    }
    let rebaked = false;
    for (const w of this.queue.drain(this.budget)) {
      this.bakeWindow(w);
      rebaked = true;
    }
    return rebaked;
  }
}
