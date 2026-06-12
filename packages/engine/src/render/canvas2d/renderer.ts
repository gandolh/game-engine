import type { LoadedAtlasImage } from "../../assets/loader";
import { Camera2D } from "../camera";
import { EDG } from "../palette";
import type { ParticleSystem } from "../particles";
import type { Canvas2dSprite, Ctx2D } from "./types";
import { compareSprite, drawSprite, createOffscreen, spritesOverlap } from "./draw";
import type { RendererLike } from "../renderer";

export class Canvas2dRenderer implements RendererLike {
  readonly camera: Camera2D;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private atlases: Map<string, LoadedAtlasImage> = new Map();
  private queue: Canvas2dSprite[] = [];
  // queue is reused across frames (reset by length, not reallocated). queueLen is the live count;
  // entries past queueLen are stale and ignored by endFrame.
  private queueLen = 0;
  private shadowLen = 0;

  // Viewport culling rect (camera + margin), recomputed in beginFrame.
  // Generous default until first beginFrame so nothing is dropped before camera is known.
  private cullLeft = -Infinity;
  private cullRight = Infinity;
  private cullTop = -Infinity;
  private cullBottom = Infinity;
  // Extra margin (world px) so sprites whose center is just off-screen but whose body overlaps still draw.
  private static readonly CULL_MARGIN = 32;

  // X-ray (occlusion-transparency) pass tuning.
  private static readonly GHOST_ALPHA = 0.4;     // re-draw alpha for an occluded flagged sprite
  private static readonly GHOST_UI_LAYER = 80;   // overlappers at/above this layer (bubbles, arrows) never occlude
  private occludableIdx: number[] = [];          // reused scratch: sorted-queue indices of occludable sprites

  // Static backdrop baked once into an offscreen canvas (world-pixel space), blitted each frame.
  private staticLayer: OffscreenCanvas | HTMLCanvasElement | null = null;
  private staticLayerW = 0;
  private staticLayerH = 0;

  // Tiling CanvasPattern for animated water; endFrame fills the world rect in one fillRect call.
  private waterPattern: CanvasPattern | null = null;
  private waterTileSize = 0;
  private waterOffsetX = 0;
  private waterOffsetY = 0;

  // Second low-alpha water pattern pass (swell pulse) drawn on top of the base fill.
  // Default alpha=0 → no-op until first set.
  private waterSwellAlpha = 0;
  private waterSwellOffsetX = 0;
  private waterSwellOffsetY = 0;

  /** Background color filled behind every frame. Games can set this to match their world. */
  clearColor: string = EDG.black;

  /**
   * When true (default), sprite world positions are snapped to integer device-pixel boundaries
   * before drawing so nearest-neighbor scaling doesn't cause ±1px shimmer.
   * The bakeStaticLayer path is unaffected — baked pixels stay byte-identical.
   */
  pixelSnap = true;

  constructor(canvas: HTMLCanvasElement, camera: Camera2D) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to acquire 2d canvas context");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.canvas = canvas;
    this.camera = camera;
  }

  /** Register (or replace) an atlas sheet by manifest id. Replacing with a new sheet takes effect next frame. */
  addAtlas(atlas: LoadedAtlasImage): void {
    this.atlases.set(atlas.manifest.id, atlas);
  }

  /** Back-compat: delegates to addAtlas. */
  setAtlas(atlas: LoadedAtlasImage): void {
    this.addAtlas(atlas);
  }

  /** The loaded atlas registered under `id`, or undefined. Lets UI code blit individual
   *  frames (e.g. hotbar icons, custom mouse cursors) without re-fetching the sheet. */
  getAtlas(id: string): LoadedAtlasImage | undefined {
    return this.atlases.get(id);
  }

  private get hasAtlases(): boolean {
    return this.atlases.size > 0;
  }

  /**
   * Bake static sprites into an offscreen world-pixel canvas once; endFrame blits it beneath
   * the dynamic queue. Re-calling replaces the previous layer.
   * `decorate` (optional): post-bake hook for procedural overlays; must leave composite state unchanged.
   */
  bakeStaticLayer(
    sprites: readonly Canvas2dSprite[],
    worldWidth: number,
    worldHeight: number,
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
   * Build a repeating tiling CanvasPattern for water. `pixelScale` upscales the texture in world
   * space so wave features survive camera downscale (a 1px ripple aliases; a 3px one reads as a wave).
   * Pattern stays null when context creation isn't supported (jsdom) — water pass becomes a no-op.
   */
  bakeWaterPattern(frame: string, atlasId: string, tileSize: number, pixelScale = 1): void {
    if (!this.hasAtlases) throw new Error("bakeWaterPattern: addAtlas must be called first");
    const atlas = this.atlases.get(atlasId);
    if (!atlas) throw new Error(`bakeWaterPattern: atlas "${atlasId}" not found`);
    const scale = Math.max(1, Math.round(pixelScale));
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

  /** Set the water pattern's scroll offset (world px). Wrap to tile size keeps the value bounded. */
  setWaterScroll(offsetX: number, offsetY: number): void {
    if (this.waterTileSize <= 0) return;
    this.waterOffsetX = offsetX % this.waterTileSize;
    this.waterOffsetY = offsetY % this.waterTileSize;
  }

  /** Push swell parameters for the coming frame. alpha ≤ 0 skips the second water pass entirely. */
  setWaterSwell(alpha: number, offsetX: number, offsetY: number): void {
    this.waterSwellAlpha = alpha;
    if (this.waterTileSize > 0) {
      this.waterSwellOffsetX = offsetX % this.waterTileSize;
      this.waterSwellOffsetY = offsetY % this.waterTileSize;
    }
  }

  /**
   * No-op on the Canvas2D backend — depth is already baked into the static layer.
   * Implements the RendererLike contract added by brief 13.
   */
  setWaterDepthMask(
    _data: Uint8Array,
    _tilesX: number,
    _tilesY: number,
    _worldWidthPx: number,
    _worldHeightPx: number,
    _tilePxSize: number,
  ): void {
    // Canvas2D: depth tinting is baked into the static layer by makeWaterDepthDecorator.
  }

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
    this.queueLen = 0;
    this.shadowLen = 0;

    const { camera } = this;
    const halfX = camera.worldUnitsX / 2;
    const halfY = camera.worldUnitsY / 2;
    const m = Canvas2dRenderer.CULL_MARGIN;
    this.cullLeft = camera.centerX - halfX - m;
    this.cullRight = camera.centerX + halfX + m;
    this.cullTop = camera.centerY - halfY - m;
    this.cullBottom = camera.centerY + halfY + m;
  }

  private inView(x: number, y: number): boolean {
    return x >= this.cullLeft && x <= this.cullRight && y >= this.cullTop && y <= this.cullBottom;
  }

  push(sprite: Canvas2dSprite): void {
    if (!this.inView(sprite.x, sprite.y)) return;
    this.queue[this.queueLen] = sprite;
    this.queueLen += 1;
  }

  /**
   * Queue a ground drop-shadow ellipse (drawn with `multiply` blending before sprites).
   * x/y: world-pixel centre; rx/ry: ellipse radii (world px); alpha: 0–1.
   */
  pushShadow(x: number, y: number, rx: number, ry: number, alpha: number): void {
    if (!this.inView(x, y)) return;
    let rec = this.shadowQueue[this.shadowLen]; // reuse pooled records (no alloc)
    if (rec === undefined) {
      rec = { x, y, rx, ry, alpha };
      this.shadowQueue[this.shadowLen] = rec;
    } else {
      rec.x = x; rec.y = y; rec.rx = rx; rec.ry = ry; rec.alpha = alpha;
    }
    this.shadowLen += 1;
  }
  private shadowQueue: Array<{ x: number; y: number; rx: number; ry: number; alpha: number }> = [];

  /** Draw one queued sprite, applying the pseudo-3D z lift and optional pixel-snap. Caller sets
   *  ctx.globalAlpha first. Mutates s.x/s.y transiently (restored before return). */
  private drawQueued(ctx: Ctx2D, s: Canvas2dSprite, sx: number, sy: number, ox: number, oy: number): void {
    const origY = s.y;
    const liftedY = s.z ? origY - s.z : origY;
    if (this.pixelSnap) {
      const origX = s.x;
      s.x = (Math.round(origX * sx + ox) - ox) / sx;
      s.y = (Math.round(liftedY * sy + oy) - oy) / sy;
      drawSprite(ctx, this.atlases, s);
      s.x = origX; s.y = origY;
    } else {
      s.y = liftedY;
      drawSprite(ctx, this.atlases, s);
      s.y = origY;
    }
  }

  /** `wash`: optional full-frame color overlay (day/night grade) applied last in screen space. color="#rrggbb"; alpha∈[0,1].
   *  `weather`: optional world-space overlay (rain/snow) drawn on top of sprites/particles, under the wash. */
  endFrame(
    wash?: { color: string; alpha: number },
    particles?: ParticleSystem,
    weather?: { count: number; draw(ctx: Ctx2D): void },
  ): void {
    if (!this.hasAtlases) return;

    const { ctx, canvas, camera } = this;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.clearColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sx = canvas.width / camera.worldUnitsX;
    const sy = canvas.height / camera.worldUnitsY;
    const left = camera.centerX - camera.worldUnitsX / 2;
    const top = camera.centerY - camera.worldUnitsY / 2;
    const ox = this.pixelSnap ? Math.round(-left * sx) : -left * sx;
    const oy = this.pixelSnap ? Math.round(-top * sy) : -top * sy;
    ctx.setTransform(sx, 0, 0, sy, ox, oy);
    ctx.imageSmoothingEnabled = false;

    // Clip to the visible world rect so zoomed-in frames only blit/fill the on-screen portion.
    const visL = Math.max(0, left);
    const visT = Math.max(0, top);
    const visR = Math.min(this.staticLayerW, left + camera.worldUnitsX);
    const visB = Math.min(this.staticLayerH, top + camera.worldUnitsY);
    const visW = Math.max(0, visR - visL);
    const visH = Math.max(0, visB - visT);

    // Water: fill the visible world rect with the tiling pattern, drawn UNDER the static layer.
    // Shows through wherever the static layer is transparent (ocean/bridge tiles).
    if (this.waterPattern && this.staticLayerW > 0 && visW > 0 && visH > 0) {
      ctx.globalAlpha = 1;
      // DOMMatrix / setTransform absent in some jsdom contexts — guard so headless tests still work.
      if (typeof DOMMatrix !== "undefined" && this.waterPattern.setTransform) {
        this.waterPattern.setTransform(
          new DOMMatrix([1, 0, 0, 1, this.waterOffsetX, this.waterOffsetY]),
        );
      }
      // At zoom-out (sx < 1) nearest-neighbor drops pattern rows/columns each frame
      // as the sub-pixel scroll shifts the sampling grid → shimmer/moiré. Use bilinear
      // only for this fillRect; sprites drawn after this still use nearest-neighbor.
      const waterSmooth = sx < 1;
      if (waterSmooth) ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = this.waterPattern;
      ctx.fillRect(visL, visT, visW, visH);

      // Swell pulse: second low-alpha pattern pass inside the smoothing guard (same bilinear treatment at zoom<1).
      if (this.waterSwellAlpha > 0) {
        if (typeof DOMMatrix !== "undefined" && this.waterPattern.setTransform) {
          this.waterPattern.setTransform(
            new DOMMatrix([1, 0, 0, 1, this.waterSwellOffsetX, this.waterSwellOffsetY]),
          );
        }
        ctx.globalAlpha = this.waterSwellAlpha;
        ctx.fillRect(visL, visT, visW, visH);
        ctx.globalAlpha = 1;
        if (typeof DOMMatrix !== "undefined" && this.waterPattern.setTransform) {
          this.waterPattern.setTransform(
            new DOMMatrix([1, 0, 0, 1, this.waterOffsetX, this.waterOffsetY]),
          );
        }
      }

      if (waterSmooth) ctx.imageSmoothingEnabled = false;
    }

    // 9-arg drawImage: only blit the visible source rect so zoomed-in frames don't pay for off-screen content.
    if (this.staticLayer && visW > 0 && visH > 0) {
      ctx.globalAlpha = 1;
      ctx.drawImage(this.staticLayer, visL, visT, visW, visH, visL, visT, visW, visH);
    }

    // Trim queue to live length before sort() so stale tail entries aren't touched.
    // (Shadow queue records are pooled in-place; we iterate by shadowLen, so no trim needed.)
    if (this.queue.length !== this.queueLen) this.queue.length = this.queueLen;

    if (this.shadowLen > 0) {
      ctx.globalCompositeOperation = "multiply";
      for (let i = 0; i < this.shadowLen; i += 1) {
        const sh = this.shadowQueue[i]!;
        ctx.globalAlpha = sh.alpha;
        ctx.fillStyle = EDG.black;
        ctx.beginPath();
        ctx.ellipse(sh.x, sh.y, sh.rx, sh.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    this.queue.sort(compareSprite);

    let occludableCount = 0;
    for (let i = 0; i < this.queueLen; i += 1) {
      const s = this.queue[i]!;
      ctx.globalAlpha = s.alpha;
      this.drawQueued(ctx, s, sx, sy, ox, oy);
      if (s.occludable) {
        this.occludableIdx[occludableCount] = i;
        occludableCount += 1;
      }
    }

    // X-ray pass: re-draw any occludable sprite at low alpha when a taller world sprite drawn in
    // front of it (later in sort order, below the UI layers) overlaps its rect — so the player stays
    // partially visible behind walls/buildings instead of fully hidden. Scoped to flagged sprites.
    for (let k = 0; k < occludableCount; k += 1) {
      const gi = this.occludableIdx[k]!;
      const g = this.queue[gi]!;
      let covered = false;
      for (let j = gi + 1; j < this.queueLen && !covered; j += 1) {
        const o = this.queue[j]!;
        if (o.occludable || o.layer >= Canvas2dRenderer.GHOST_UI_LAYER) continue;
        if (spritesOverlap(g, o)) covered = true;
      }
      if (covered) {
        ctx.globalAlpha = g.alpha * Canvas2dRenderer.GHOST_ALPHA;
        this.drawQueued(ctx, g, sx, sy, ox, oy);
      }
    }

    ctx.globalAlpha = 1;

    if (particles && particles.count > 0) {
      particles.draw(ctx);
    }

    // Weather curtain (rain/snow) sits in front of the world, still in world space (camera transform
    // active), so drops parallax with the scene. Drawn after particles so splash crowns read beneath it.
    if (weather && weather.count > 0) {
      weather.draw(ctx);
    }

    // Wash drawn in screen space (camera transform reset); composite/alpha restored so state never leaks.
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
