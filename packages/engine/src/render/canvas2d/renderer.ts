import type { LoadedAtlasImage } from "../../assets/loader";
import { Camera2D } from "../camera";
import { EDG } from "../palette";
import type { ParticleSystem } from "../particles";
import type { Canvas2dSprite, Ctx2D } from "./types";
import { compareSprite, drawSprite, createOffscreen } from "./draw";

export class Canvas2dRenderer {
  readonly camera: Camera2D;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  /** Map of sheet id → loaded atlas image. Populated by addAtlas(). */
  private atlases: Map<string, LoadedAtlasImage> = new Map();
  private queue: Canvas2dSprite[] = [];
  /** Live element count in `queue` (the array is reused across frames, not
   *  reallocated — see beginFrame). Entries past queueLen are stale. */
  private queueLen = 0;
  private shadowLen = 0;

  // Visible world-space rect for this frame (camera viewport + a one-tile
  // margin), computed in beginFrame. push()/pushShadow() cull against it so
  // off-screen sprites never reach the draw loop. Generous default until the
  // first beginFrame so nothing is dropped before the camera is known.
  private cullLeft = -Infinity;
  private cullRight = Infinity;
  private cullTop = -Infinity;
  private cullBottom = Infinity;
  /** Half-extent margin (world px) added around the viewport so sprites whose
   *  center is just off-screen but whose body overlaps still draw. */
  private static readonly CULL_MARGIN = 32;

  // Cached static layer: the unchanging backdrop (tiles, fences, plot dirt)
  // baked once into an offscreen canvas in world-pixel space, then blitted
  // each frame under the dynamic queue. Avoids re-drawing ~1600 tiles/frame.
  private staticLayer: OffscreenCanvas | HTMLCanvasElement | null = null;
  private staticLayerW = 0;
  private staticLayerH = 0;

  // Animated water surface: a single tiling CanvasPattern built once from one
  // atlas frame. `endFrame` fills the whole world rect with it in ONE call
  // (under the static layer), scrolling the pattern's matrix by a per-frame
  // offset so the water visibly flows. Replaces per-water-cell drawImage.
  private waterPattern: CanvasPattern | null = null;
  private waterTileSize = 0;
  private waterOffsetX = 0;
  private waterOffsetY = 0;

  // brief 64 — swell pulse: a second low-alpha pattern pass drawn on top of
  // the base water fill, shifted by a small offset, to create a gentle ambient
  // wave swell. Alpha and offsets are pushed each frame by the render loop
  // (same API as setWaterScroll). Default alpha=0 → no-op until first set.
  private waterSwellAlpha = 0;
  private waterSwellOffsetX = 0;
  private waterSwellOffsetY = 0;

  /**
   * Backdrop color filled behind every frame (the area outside the world / not
   * covered by sprites). Defaults to a near-black; games can set it to match
   * their world (e.g. Farm Valley uses an ocean blue so the map reads as
   * islands surrounded by water).
   */
  clearColor: string = EDG.black;

  constructor(canvas: HTMLCanvasElement, camera: Camera2D) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to acquire 2d canvas context");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.canvas = canvas;
    this.camera = camera;
  }

  /**
   * Register (or replace) a single atlas sheet keyed by its manifest id.
   * Calling this with an already-known id replaces the previous sheet — the
   * seam for brief 45's seasonal terrain swap (call `addAtlas(newTerrainSheet)`
   * and all terrain sprites will resolve against the new sheet on the next frame).
   * No lazy-load or hot-swap machinery is built here; the seam is just open.
   */
  addAtlas(atlas: LoadedAtlasImage): void {
    this.atlases.set(atlas.manifest.id, atlas);
  }

  /**
   * Back-compat shim: register a single atlas as if it were the only one.
   * Kept so engine consumers (tests, etc.) that call `setAtlas` without knowing
   * about multi-sheet still work. Internally delegates to `addAtlas`.
   */
  setAtlas(atlas: LoadedAtlasImage): void {
    this.addAtlas(atlas);
  }

  /** True if at least one atlas sheet has been registered. */
  private get hasAtlases(): boolean {
    return this.atlases.size > 0;
  }

  /**
   * Bake a set of static sprites into an offscreen layer of `worldWidth ×
   * worldHeight` world pixels, drawn once. `endFrame` then blits this layer
   * (transformed by the camera) beneath the per-frame dynamic queue.
   *
   * Call once after the atlas is set and the static scene is known. Re-calling
   * replaces the previous layer. Generic: the caller decides what counts as
   * "static" (Farm Valley bakes the backdrop tiles + farm fences + plot dirt).
   */
  bakeStaticLayer(
    sprites: readonly Canvas2dSprite[],
    worldWidth: number,
    worldHeight: number,
    /**
     * Optional post-bake hook. After all static sprites are drawn, the caller
     * gets the offscreen 2D context + layer dimensions to stamp a procedural
     * overlay (e.g. per-tile ground-noise brightness — see farm-valley's
     * render/ground-noise). The engine stays generic: it knows nothing about
     * tiles or seeds. The hook must leave composite state as it found it.
     */
    decorate?: (ctx: Ctx2D, widthPx: number, heightPx: number) => void,
  ): void {
    if (!this.hasAtlases) throw new Error("bakeStaticLayer: addAtlas must be called first");
    const w = Math.max(1, Math.ceil(worldWidth));
    const h = Math.max(1, Math.ceil(worldHeight));
    const surface = createOffscreen(w, h);
    const ctx = surface.getContext("2d") as Ctx2D | null;
    if (!ctx) throw new Error("bakeStaticLayer: failed to acquire offscreen 2d context");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    // Draw in world coordinates directly (no camera transform): the layer IS
    // the world. Sort by layer then Y (same rule as endFrame dynamic queue).
    const sorted = sprites.slice().sort(compareSprite);
    for (const s of sorted) {
      drawSprite(ctx, this.atlases, s);
    }
    if (decorate) decorate(ctx, w, h);
    this.staticLayer = surface;
    this.staticLayerW = w;
    this.staticLayerH = h;
  }

  /**
   * Build the repeating water pattern from a single atlas `frame`, wrapped in a
   * "repeat" CanvasPattern. Call once after the atlas is set. The game then
   * calls `setWaterScroll` each frame and `endFrame` fills the world with it in
   * one `fillRect`.
   *
   * `pixelScale` (default 1) enlarges the texture in world space: each source
   * texel maps to `pixelScale` world pixels, so the wave features become
   * `pixelScale×` bigger. Bigger features survive the camera downscale when
   * zoomed out (a 1px ripple aliases into noise at zoom 0.5; a 3px one reads as
   * a wave). The pattern repeats every `tileSize × pixelScale` world px.
   *
   * Generic: the engine knows only "a tiling pattern + a scroll offset," not
   * "ocean." If pattern creation isn't supported (e.g. some jsdom contexts) the
   * pattern stays null and the water pass is a no-op.
   */
  /**
   * Build the repeating water pattern from a single atlas `frame` on sheet
   * `atlasId`. Call once after atlases are loaded.
   */
  bakeWaterPattern(frame: string, atlasId: string, tileSize: number, pixelScale = 1): void {
    if (!this.hasAtlases) throw new Error("bakeWaterPattern: addAtlas must be called first");
    const atlas = this.atlases.get(atlasId);
    if (!atlas) throw new Error(`bakeWaterPattern: atlas "${atlasId}" not found`);
    const scale = Math.max(1, Math.round(pixelScale));
    // Pattern tile covers `tileSize × scale` world px; nearest-neighbour upscale
    // keeps the wave texels crisp and chunky (imageSmoothingEnabled = false).
    const size = Math.max(1, Math.ceil(tileSize) * scale);
    const surface = createOffscreen(size, size);
    const tctx = surface.getContext("2d") as Ctx2D | null;
    if (!tctx) throw new Error("bakeWaterPattern: failed to acquire offscreen 2d context");
    tctx.imageSmoothingEnabled = false;
    const r = atlas.frameRect(frame);
    tctx.drawImage(atlas.bitmap, r.x, r.y, r.w, r.h, 0, 0, size, size);
    this.waterPattern = this.ctx.createPattern(surface, "repeat");
    this.waterTileSize = size;
    this.waterOffsetX = 0;
    this.waterOffsetY = 0;
  }

  /**
   * Set the water pattern's scroll offset (world pixels) for the coming frame.
   * Wrapped to the tile size so the float never grows without bound. Cheap; call
   * every frame with a slowly-advancing sin/cos offset to make the water flow.
   */
  setWaterScroll(offsetX: number, offsetY: number): void {
    if (this.waterTileSize <= 0) return;
    this.waterOffsetX = offsetX % this.waterTileSize;
    this.waterOffsetY = offsetY % this.waterTileSize;
  }

  /**
   * brief 64 — swell pulse. Push the swell parameters for the coming frame.
   * The render loop computes alpha (0–1) and offset from a sine phase and calls
   * this once per frame; `endFrame` draws a second pattern pass at the given
   * alpha+offset on top of the base water fill. When alpha ≤ 0 the pass is
   * skipped entirely. Mirrors `setWaterScroll` — the engine only draws what
   * it's told; the wall-clock sine lives in the render loop.
   */
  setWaterSwell(alpha: number, offsetX: number, offsetY: number): void {
    this.waterSwellAlpha = alpha;
    if (this.waterTileSize > 0) {
      this.waterSwellOffsetX = offsetX % this.waterTileSize;
      this.waterSwellOffsetY = offsetY % this.waterTileSize;
    }
  }

  /** Drop the cached static layer (e.g. before re-baking a changed world). */
  clearStaticLayer(): void {
    this.staticLayer = null;
    this.staticLayerW = 0;
    this.staticLayerH = 0;
  }

  beginFrame(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const desiredW = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const desiredH = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== desiredW || this.canvas.height !== desiredH) {
      this.canvas.width = desiredW;
      this.canvas.height = desiredH;
    }
    // Reuse the queue arrays across frames — reset by length, don't realloc.
    // (Stale entries past the live length are overwritten by push() or ignored
    // by endFrame, which iterates only [0, queueLen).)
    this.queueLen = 0;
    this.shadowLen = 0;

    // Recompute the visible world rect (camera viewport + margin) for culling.
    const { camera } = this;
    const halfX = camera.worldUnitsX / 2;
    const halfY = camera.worldUnitsY / 2;
    const m = Canvas2dRenderer.CULL_MARGIN;
    this.cullLeft = camera.centerX - halfX - m;
    this.cullRight = camera.centerX + halfX + m;
    this.cullTop = camera.centerY - halfY - m;
    this.cullBottom = camera.centerY + halfY + m;
  }

  /** True if a world-space point lies within this frame's visible rect. */
  private inView(x: number, y: number): boolean {
    return x >= this.cullLeft && x <= this.cullRight && y >= this.cullTop && y <= this.cullBottom;
  }

  push(sprite: Canvas2dSprite): void {
    // Viewport cull: skip sprites whose center is outside the visible rect.
    if (!this.inView(sprite.x, sprite.y)) return;
    this.queue[this.queueLen] = sprite;
    this.queueLen += 1;
  }

  /**
   * Queue a ground drop-shadow ellipse to be drawn in a dedicated shadow pass
   * before all sprites. Shadows are rendered with `multiply` blending so they
   * darken the ground naturally without a harsh black edge.
   *
   * `x`/`y` — world-pixel centre (typically the sprite's feet position).
   * `rx`/`ry` — ellipse radii in world pixels.
   * `alpha` — opacity of the shadow (0–1).
   */
  pushShadow(x: number, y: number, rx: number, ry: number, alpha: number): void {
    // Viewport cull, matching push().
    if (!this.inView(x, y)) return;
    // Reuse pooled shadow records — mutate in place rather than allocate.
    let rec = this.shadowQueue[this.shadowLen];
    if (rec === undefined) {
      rec = { x, y, rx, ry, alpha };
      this.shadowQueue[this.shadowLen] = rec;
    } else {
      rec.x = x; rec.y = y; rec.rx = rx; rec.ry = ry; rec.alpha = alpha;
    }
    this.shadowLen += 1;
  }
  private shadowQueue: Array<{ x: number; y: number; rx: number; ry: number; alpha: number }> = [];

  /**
   * `wash` (brief 26, farm-valley) is an optional full-frame color overlay
   * applied last in screen space — a day/night + seasonal grade. The engine
   * stays generic: it just blends one translucent rect over the finished frame
   * and restores composite/alpha state. `color` is "#rrggbb"; `alpha` ∈ [0,1].
   */
  endFrame(wash?: { color: string; alpha: number }, particles?: ParticleSystem): void {
    if (!this.hasAtlases) return;

    const { ctx, canvas, camera } = this;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.clearColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sx = canvas.width / camera.worldUnitsX;
    const sy = canvas.height / camera.worldUnitsY;
    const left = camera.centerX - camera.worldUnitsX / 2;
    const top = camera.centerY - camera.worldUnitsY / 2;
    ctx.setTransform(sx, 0, 0, sy, -left * sx, -top * sy);
    ctx.imageSmoothingEnabled = false;

    // Clip the world-space fills/blits below to the visible rect (intersected
    // with the world bounds). When zoomed in this draws only the on-screen
    // portion of the water + static layer instead of the whole 88×80 world.
    const visL = Math.max(0, left);
    const visT = Math.max(0, top);
    const visR = Math.min(this.staticLayerW, left + camera.worldUnitsX);
    const visB = Math.min(this.staticLayerH, top + camera.worldUnitsY);
    const visW = Math.max(0, visR - visL);
    const visH = Math.max(0, visB - visT);

    // Animated water surface: fill the VISIBLE world rect with the tiling
    // pattern, scrolled by the per-frame offset. Drawn UNDER the static layer
    // (islands), so it shows through wherever the static layer is transparent
    // (ocean/bridge tiles the game leaves unbaked). One fillRect for all water.
    if (this.waterPattern && this.staticLayerW > 0 && visW > 0 && visH > 0) {
      ctx.globalAlpha = 1;
      // setTransform on the pattern shifts the texture origin → scroll. It's in
      // the pattern's own space, which here equals world space (the canvas
      // transform is already the camera). Wrap keeps the matrix values small.
      // DOMMatrix / pattern.setTransform are absent in some jsdom contexts —
      // guard so headless render (tests) still fills static water without scroll.
      if (typeof DOMMatrix !== "undefined" && this.waterPattern.setTransform) {
        this.waterPattern.setTransform(
          new DOMMatrix([1, 0, 0, 1, this.waterOffsetX, this.waterOffsetY]),
        );
      }
      // brief 63 — water shimmer fix: at downscale (sx < 1) nearest-neighbor
      // minification inconsistently drops pattern rows/columns each frame as the
      // sub-pixel scroll offset shifts the sampling grid → shimmer/moiré. Switch
      // to bilinear smoothing only for this fillRect so the downscaled water blurs
      // smoothly instead of flickering. Land tiles and sprites (drawn after this
      // block) still use nearest-neighbor (imageSmoothingEnabled remains false for
      // them). The flip is cheap — one canvas state property toggle per frame.
      const waterSmooth = sx < 1;
      if (waterSmooth) ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = this.waterPattern;
      ctx.fillRect(visL, visT, visW, visH);

      // brief 64 — swell pulse: second low-alpha pass of the same pattern at a
      // small offset so the water appears to gently rise/fall. Sits INSIDE the
      // smoothing guard so it gets the same bilinear treatment at low zoom —
      // prevents the swell layer itself from shimmering at zoom < 1. Skipped
      // entirely when swellAlpha ≤ 0 (e.g. before the render loop sets it).
      if (this.waterSwellAlpha > 0) {
        if (typeof DOMMatrix !== "undefined" && this.waterPattern.setTransform) {
          this.waterPattern.setTransform(
            new DOMMatrix([1, 0, 0, 1, this.waterSwellOffsetX, this.waterSwellOffsetY]),
          );
        }
        ctx.globalAlpha = this.waterSwellAlpha;
        ctx.fillRect(visL, visT, visW, visH);
        ctx.globalAlpha = 1;
        // Restore the base scroll transform so later code sees a clean state.
        if (typeof DOMMatrix !== "undefined" && this.waterPattern.setTransform) {
          this.waterPattern.setTransform(
            new DOMMatrix([1, 0, 0, 1, this.waterOffsetX, this.waterOffsetY]),
          );
        }
      }

      if (waterSmooth) ctx.imageSmoothingEnabled = false;
    }

    // Cached static backdrop first (one blit), under the dynamic sprites. Only
    // the visible source rect is blitted (9-arg drawImage) so zooming in doesn't
    // pay for the off-screen remainder of the baked layer.
    if (this.staticLayer && visW > 0 && visH > 0) {
      ctx.globalAlpha = 1;
      ctx.drawImage(this.staticLayer, visL, visT, visW, visH, visL, visT, visW, visH);
    }

    // The sprite queue is reused across frames AND sorted below; sort() would
    // touch stale tail entries, so trim to this frame's live length first (no
    // realloc — trimming keeps the backing store). The shadow queue is NOT
    // trimmed: its records are pooled (reused in place) and we iterate it by
    // shadowLen, so stale tail records are simply skipped.
    if (this.queue.length !== this.queueLen) this.queue.length = this.queueLen;

    // Shadow pass: draw all ground ellipses first, under every sprite.
    // `multiply` blend darkens the ground tile naturally without a harsh edge.
    if (this.shadowLen > 0) {
      ctx.globalCompositeOperation = "multiply";
      for (let i = 0; i < this.shadowLen; i += 1) {
        const sh = this.shadowQueue[i]!;
        ctx.globalAlpha = sh.alpha;
        // EDG.black under a `multiply` blend = soft shadow (darkens the ground).
        ctx.fillStyle = EDG.black;
        ctx.beginPath();
        ctx.ellipse(sh.x, sh.y, sh.rx, sh.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // Y-sort within each layer: sprites with a lower Y (closer to screen top)
    // draw first; sprites with a higher Y (closer to screen bottom) draw on top.
    // This is the primary depth cue in top-down 2D RPGs — overlap, not scale.
    this.queue.sort(compareSprite);

    for (let i = 0; i < this.queueLen; i += 1) {
      const s = this.queue[i]!;
      ctx.globalAlpha = s.alpha;
      drawSprite(ctx, this.atlases, s);
    }

    ctx.globalAlpha = 1;

    // Particle system — drawn in world space after sprites, before the wash.
    if (particles && particles.count > 0) {
      particles.draw(ctx);
    }

    // brief 26 — full-frame day/night + seasonal wash, in SCREEN space (reset
    // the camera transform first), then restore composite/alpha so state never
    // leaks into the next frame (there is no per-frame save/restore here).
    if (wash && wash.alpha > 0.001) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = wash.alpha;
      ctx.fillStyle = wash.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
  }
}
