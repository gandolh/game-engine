import type { LoadedAtlasImage } from "../assets/loader";
import { Camera2D } from "./camera";
import { EDG } from "./palette";
import type { ParticleSystem } from "./particles";

export interface Canvas2dSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  rotation: number;
  layer: number;
  alpha: number;
  /** Mirror horizontally about the sprite center (for left/right facing from a
   *  single side-profile frame). Optional; defaults to false. */
  flipX?: boolean;
}

/** Minimal 2D context surface the renderer needs — satisfied by both
 *  CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D. */
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class Canvas2dRenderer {
  readonly camera: Camera2D;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private atlas: LoadedAtlasImage | null = null;
  private queue: Canvas2dSprite[] = [];

  // Cached static layer: the unchanging backdrop (tiles, fences, plot dirt)
  // baked once into an offscreen canvas in world-pixel space, then blitted
  // each frame under the dynamic queue. Avoids re-drawing ~1600 tiles/frame.
  private staticLayer: OffscreenCanvas | HTMLCanvasElement | null = null;
  private staticLayerW = 0;
  private staticLayerH = 0;

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

  setAtlas(atlas: LoadedAtlasImage): void {
    this.atlas = atlas;
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
    if (!this.atlas) throw new Error("bakeStaticLayer: setAtlas must be called first");
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
      drawSprite(ctx, this.atlas, s);
    }
    if (decorate) decorate(ctx, w, h);
    this.staticLayer = surface;
    this.staticLayerW = w;
    this.staticLayerH = h;
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
    this.queue = [];
    this.shadowQueue = [];
  }

  push(sprite: Canvas2dSprite): void {
    this.queue.push(sprite);
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
    this.shadowQueue.push({ x, y, rx, ry, alpha });
  }
  private shadowQueue: Array<{ x: number; y: number; rx: number; ry: number; alpha: number }> = [];

  /**
   * `wash` (brief 26, farm-valley) is an optional full-frame color overlay
   * applied last in screen space — a day/night + seasonal grade. The engine
   * stays generic: it just blends one translucent rect over the finished frame
   * and restores composite/alpha state. `color` is "#rrggbb"; `alpha` ∈ [0,1].
   */
  endFrame(wash?: { color: string; alpha: number }, particles?: ParticleSystem): void {
    if (!this.atlas) return;

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

    // Cached static backdrop first (one blit), under the dynamic sprites.
    if (this.staticLayer) {
      ctx.globalAlpha = 1;
      ctx.drawImage(this.staticLayer, 0, 0, this.staticLayerW, this.staticLayerH);
    }

    // Shadow pass: draw all ground ellipses first, under every sprite.
    // `multiply` blend darkens the ground tile naturally without a harsh edge.
    if (this.shadowQueue.length > 0) {
      ctx.globalCompositeOperation = "multiply";
      for (const sh of this.shadowQueue) {
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

    for (const s of this.queue) {
      ctx.globalAlpha = s.alpha;
      drawSprite(ctx, this.atlas, s);
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

/** Stable sort comparator: layer ascending, then Y ascending.
 *  JS Array.sort is guaranteed stable (ES2019+), so equal-key sprites
 *  retain their insertion order — no index tiebreaker needed. */
function compareSprite(a: Canvas2dSprite, b: Canvas2dSprite): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  return a.y - b.y;
}

/** Draw one sprite via the atlas frame rect. Shared by the live queue and the
 *  static-layer bake so both paths stay pixel-identical. */
function drawSprite(ctx: Ctx2D, atlas: LoadedAtlasImage, s: Canvas2dSprite): void {
  const r = atlas.frameRect(s.frame);
  const bitmap = atlas.bitmap;
  if (s.rotation !== 0 || s.flipX) {
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.rotation !== 0) ctx.rotate(s.rotation);
    if (s.flipX) ctx.scale(-1, 1);
    ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, -s.width / 2, -s.height / 2, s.width, s.height);
    ctx.restore();
  } else {
    ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, s.x - s.width / 2, s.y - s.height / 2, s.width, s.height);
  }
}

/** Offscreen surface for the static layer: prefer OffscreenCanvas, fall back
 *  to a detached <canvas> (older browsers / jsdom). */
function createOffscreen(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
