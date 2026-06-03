import type { LoadedAtlasImage } from "../assets/loader";
import { Camera2D } from "./camera";

export interface Canvas2dSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  rotation: number;
  layer: number;
  alpha: number;
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
    // the world. Sort by layer then insertion order, same as endFrame.
    const indexed = sprites.map((s, i) => ({ s, i }));
    indexed.sort((a, b) => (a.s.layer !== b.s.layer ? a.s.layer - b.s.layer : a.i - b.i));
    for (const { s } of indexed) {
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
  }

  push(sprite: Canvas2dSprite): void {
    this.queue.push(sprite);
  }

  endFrame(): void {
    if (!this.atlas) return;

    const { ctx, canvas, camera } = this;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0c0d12";
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

    const indexed = this.queue.map((s, i) => ({ s, i }));
    indexed.sort((a, b) => a.s.layer !== b.s.layer ? a.s.layer - b.s.layer : a.i - b.i);

    for (const { s } of indexed) {
      ctx.globalAlpha = s.alpha;
      drawSprite(ctx, this.atlas, s);
    }

    ctx.globalAlpha = 1;
  }
}

/** Draw one sprite via the atlas frame rect. Shared by the live queue and the
 *  static-layer bake so both paths stay pixel-identical. */
function drawSprite(ctx: Ctx2D, atlas: LoadedAtlasImage, s: Canvas2dSprite): void {
  const r = atlas.frameRect(s.frame);
  const bitmap = atlas.bitmap;
  if (s.rotation !== 0) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);
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
