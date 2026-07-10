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
 * Small worlds (solo Citadel's 96×96 ⇒ 3072×1552 iso px) fall under the texel
 * threshold and bake the whole world ONCE at boot — byte-identical to the
 * pre-windowing `createCitadelRenderer`, and `update()` is a no-op. The 256×256
 * MP world (brief 29) crosses it and **must** window: its iso extent is
 * 8192×4112 ⇒ ~134.7 MB of RGBA, with the width exactly on WebGPU's default
 * `maxTextureDimension2D`. Windowing is what makes that world renderable at all.
 *
 * Both paths bake ISO DIAMONDS into iso world-px space (brief 110). They used to
 * disagree: the windowed path handed the engine an AXIS-ALIGNED `tile·TILE_SIZE`
 * sub-region while the decorate callback painted iso — so its pixels landed in the
 * wrong place. Nothing caught it because `shouldWindow` was never true in a
 * shipped client (the client hardcoded a 96×96 world; see brief 108).
 *
 * Render-only; no determinism impact.
 */
import type { RendererLike, StaticRegion } from "@engine/core";
import type { TerrainGrid } from "@citadel/sim-core";
import { visibleTileWindow, type TileWindow } from "./render-window";
import { IncrementalQueue } from "./build-budget";
import { makeTerrainDecorate } from "./terrain-dither";
import { ISO_HW, ISO_HH } from "./iso";
import type { IsoProjection } from "./iso";

/** Tiles of margin baked beyond the viewport so a tile entering the screen edge
 *  is already on the texture before the next re-bake lands. */
export const WINDOW_PAD = 8;

/** Max windowed re-bakes drained per frame. A bake is atomic (one engine call),
 *  so 1 is the natural cap: the latest window is baked next frame, the pan
 *  itself stays synchronous-rebake-free. */
export const REBAKE_BUDGET = 1;

/** Bake the whole world in one texture below this texel area; window above it.
 *  Measured on the ISO extents, which is the space the texture actually lives in:
 *  solo 96×96 ⇒ 3072×1552 ≈ 4.8 M texels (whole-world); MP 256×256 ⇒ 8192×4112
 *  ≈ 33.7 M texels ≈ 134.7 MB RGBA, and 8192 is WebGPU's default
 *  `maxTextureDimension2D` — so the MP world MUST window. 16 M sits between them. */
export const WINDOW_TEXEL_THRESHOLD = 4096 * 4096;

/** The minimal camera view the window math needs (structural — keeps this
 *  testable without a real Camera2D / GPU). Citadel's Camera2D satisfies it. */
export interface CameraView {
  centerX: number;
  centerY: number;
  worldUnitsX: number;
  worldUnitsY: number;
}

/**
 * The **iso** world-px sub-region a tile window covers — the axis-aligned bounding
 * box, in the space the bake actually paints into, of the union of that window's
 * tile diamonds.
 *
 * Brief 110 / review findings item 35: this used to return `minTx·TILE_SIZE …`, an
 * AXIS-ALIGNED tile rect, while the decorate callback paints iso diamonds into an
 * iso-world-sized texture. The two spaces disagreed, so a windowed bake wrote its
 * pixels somewhere else entirely. Only the whole-world (solo) path was ever exercised,
 * which is why it went unnoticed.
 *
 * Extremes of the union (each tile's diamond is `ISO_HW`/`ISO_HH` about its centre):
 *   x: leftmost is tile (minTx, maxTy); rightmost is (maxTx, minTy)
 *   y: topmost   is tile (minTx, minTy); bottom-most is (maxTx, maxTy)
 */
export function windowRegion(iso: IsoProjection, w: TileWindow): StaticRegion {
  const left = iso.tileCenterToIso(w.minTx, w.maxTy).x - ISO_HW;
  const right = iso.tileCenterToIso(w.maxTx, w.minTy).x + ISO_HW;
  const top = iso.tileCenterToIso(w.minTx, w.minTy).y - ISO_HH;
  const bottom = iso.tileCenterToIso(w.maxTx, w.maxTy).y + ISO_HH;
  return {
    originX: Math.max(0, Math.floor(left)),
    originY: Math.max(0, Math.floor(top)),
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
  };
}

/** Stable key for queue dedup + change detection. */
export function windowKey(w: TileWindow): string {
  return `${w.minTx},${w.minTy},${w.maxTx},${w.maxTy}`;
}

/** Whether a world this big should window (vs bake whole). Takes ISO world-px. */
export function shouldWindow(isoWorldPxW: number, isoWorldPxH: number): boolean {
  return isoWorldPxW * isoWorldPxH > WINDOW_TEXEL_THRESHOLD;
}

export interface RenderWindowOptions {
  pad?: number;
  budget?: number;
  /** Force windowing on/off (tests). Default: derive from the world size. */
  windowed?: boolean;
}

export class RenderWindowController {
  private readonly renderer: RendererLike;
  private readonly iso: IsoProjection;
  private readonly terrain: TerrainGrid;
  private readonly pad: number;
  private readonly budget: number;
  private readonly queue = new IncrementalQueue<TileWindow>(windowKey);

  /** Whether this world windows (large) or bakes whole (small). */
  readonly windowed: boolean;

  private baked: TileWindow | null = null;

  constructor(renderer: RendererLike, iso: IsoProjection, terrain: TerrainGrid, opts: RenderWindowOptions = {}) {
    this.renderer = renderer;
    this.iso = iso;
    this.terrain = terrain;
    this.pad = opts.pad ?? WINDOW_PAD;
    this.budget = opts.budget ?? REBAKE_BUDGET;
    // Both paths now paint ISO DIAMONDS into iso world-px space; the windowed one
    // just restricts the tile loop and hands the engine the iso sub-region those
    // diamonds land in (see windowRegion). Threshold on the ISO extents, because
    // that is the texture actually being allocated.
    this.windowed = opts.windowed ?? shouldWindow(iso.worldPxW, iso.worldPxH);
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
    // so they ARE the visible iso world-px extent → pass zoom=1.
    return visibleTileWindow(
      this.iso,
      camera.centerX,
      camera.centerY,
      camera.worldUnitsX,
      camera.worldUnitsY,
      1,
      this.pad,
    );
  }

  private bakeWindow(w: TileWindow): void {
    // The logical world stays the full iso extent (the camera frames that space);
    // only the REGION written is the window's iso bounding box.
    this.renderer.bakeStaticLayer(
      [],
      this.iso.worldPxW,
      this.iso.worldPxH,
      makeTerrainDecorate(this.iso, this.terrain, w),
      windowRegion(this.iso, w),
    );
    this.baked = w;
  }

  /** Bake the initial static layer. Call once after creating the renderer. */
  bakeInitial(camera: CameraView): void {
    if (this.windowed) {
      this.bakeWindow(this.currentWindow(camera));
    } else {
      // Whole iso world: the terrain bakes as diamonds into an ISO-world-sized
      // texture (origin 0,0), which the engine camera then frames in iso space.
      this.renderer.bakeStaticLayer(
        [],
        this.iso.worldPxW,
        this.iso.worldPxH,
        makeTerrainDecorate(this.iso, this.terrain),
      );
      this.baked = { minTx: 0, minTy: 0, maxTx: this.iso.worldTilesW - 1, maxTy: this.iso.worldTilesH - 1 };
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
