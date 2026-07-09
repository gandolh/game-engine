import type { LoadedAtlasImage } from "../../assets/loader";
import { Camera2D } from "../camera";
import { EDG } from "../palette";
import type { ParticleSystem } from "../particles";
import type { Canvas2dSprite, Ctx2D } from "./types";
import { compareSprite, drawSprite, createOffscreen, spritesOverlap } from "./draw";
import type { RendererLike, OverlayFn, UIQuad } from "../renderer";
import { drawUIQuad } from "../ui-draw";
import { resolveStaticRegion, staticBlitRect } from "../static-region";
import type { StaticRegion } from "../static-region";

export class Canvas2dRenderer implements RendererLike {
  readonly camera: Camera2D;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private atlases: Map<string, LoadedAtlasImage> = new Map();
  private queue: Canvas2dSprite[] = [];

  private queueLen = 0;
  private shadowLen = 0;

  private cullLeft = -Infinity;
  private cullRight = Infinity;
  private cullTop = -Infinity;
  private cullBottom = Infinity;

  private static readonly CULL_MARGIN = 32;

  private static readonly GHOST_ALPHA = 0.4;     
  private static readonly GHOST_UI_LAYER = 80;   
  private occludableIdx: number[] = [];          

  private staticLayer: OffscreenCanvas | HTMLCanvasElement | null = null;
  // staticLayerW/H are the LOGICAL world extent (for the visible-rect clamp),
  // not the texture size — they differ when a windowed sub-region is baked.
  private staticLayerW = 0;
  private staticLayerH = 0;
  // The baked region (origin + texture size). null until first bake.
  private staticRegion: StaticRegion | null = null;

  private waterPattern: CanvasPattern | null = null;
  private waterTileSize = 0;
  private waterOffsetX = 0;
  private waterOffsetY = 0;

  private waterSwellAlpha = 0;
  private waterSwellOffsetX = 0;
  private waterSwellOffsetY = 0;

  clearColor: string = EDG.black;

  pixelSnap = true;

  constructor(canvas: HTMLCanvasElement, camera: Camera2D) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to acquire 2d canvas context");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.canvas = canvas;
    this.camera = camera;
  }

  addAtlas(atlas: LoadedAtlasImage): void {
    this.atlases.set(atlas.manifest.id, atlas);
  }

  setAtlas(atlas: LoadedAtlasImage): void {
    this.addAtlas(atlas);
  }

  getAtlas(id: string): LoadedAtlasImage | undefined {
    return this.atlases.get(id);
  }

  private get hasAtlases(): boolean {
    return this.atlases.size > 0;
  }

  bakeStaticLayer(
    sprites: readonly Canvas2dSprite[],
    worldWidth: number,
    worldHeight: number,
    decorate?: (ctx: Ctx2D, widthPx: number, heightPx: number) => void,
    region?: StaticRegion,
  ): void {
    if (!this.hasAtlases) throw new Error("bakeStaticLayer: addAtlas must be called first");
    const reg = resolveStaticRegion(worldWidth, worldHeight, region);
    const w = reg.width;
    const h = reg.height;
    const surface = createOffscreen(w, h);
    const ctx = surface.getContext("2d") as Ctx2D | null;
    if (!ctx) throw new Error("bakeStaticLayer: failed to acquire offscreen 2d context");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    // Sprites + decorate draw in WORLD coordinates; translating by -origin maps
    // them onto the windowed texture (no-op for a whole-world bake, so Farm /
    // solo Citadel stay byte-identical).
    const offset = reg.originX !== 0 || reg.originY !== 0;
    if (offset) ctx.translate(-reg.originX, -reg.originY);
    const sorted = sprites.slice().sort(compareSprite);
    for (const s of sorted) {
      drawSprite(ctx, this.atlases, s);
    }
    if (decorate) decorate(ctx, w, h);
    if (offset) ctx.translate(reg.originX, reg.originY);
    this.staticLayer = surface;
    this.staticLayerW = Math.max(1, Math.ceil(worldWidth));
    this.staticLayerH = Math.max(1, Math.ceil(worldHeight));
    this.staticRegion = reg;
  }

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

  setWaterScroll(offsetX: number, offsetY: number): void {
    if (this.waterTileSize <= 0) return;
    this.waterOffsetX = offsetX % this.waterTileSize;
    this.waterOffsetY = offsetY % this.waterTileSize;
  }

  setWaterSwell(alpha: number, offsetX: number, offsetY: number): void {
    this.waterSwellAlpha = alpha;
    if (this.waterTileSize > 0) {
      this.waterSwellOffsetX = offsetX % this.waterTileSize;
      this.waterSwellOffsetY = offsetY % this.waterTileSize;
    }
  }

  setWaterDepthMask(
    _data: Uint8Array,
    _tilesX: number,
    _tilesY: number,
    _worldWidthPx: number,
    _worldHeightPx: number,
    _tilePxSize: number,
  ): void {

  }

  clearStaticLayer(): void {
    this.staticLayer = null;
    this.staticLayerW = 0;
    this.staticLayerH = 0;
    this.staticRegion = null;
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
    // Reset the UI draw-list too: it's otherwise only cleared in beginUI(), so a
    // consumer that stops calling beginUI would re-draw its last UI quads forever.
    this.uiLen = 0;

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
    const halfW = sprite.width / 2;
    const halfH = sprite.height / 2;
    if (
      sprite.x + halfW < this.cullLeft ||
      sprite.x - halfW > this.cullRight ||
      sprite.y + halfH < this.cullTop ||
      sprite.y - halfH > this.cullBottom
    ) return;
    this.queue[this.queueLen] = sprite;
    this.queueLen += 1;
  }

  pushShadow(x: number, y: number, rx: number, ry: number, alpha: number): void {
    if (!this.inView(x, y)) return;
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

  // Screen-space UI draw-list. `uiActive` gates accumulation so the layer is inert
  // (and zero-overhead) until a caller opts in via beginUI(). Reset each beginUI().
  private uiQueue: UIQuad[] = [];
  private uiLen = 0;
  private uiActive = false;

  beginUI(): void {
    this.uiActive = true;
    this.uiLen = 0;
  }

  pushUI(quad: UIQuad): void {
    if (!this.uiActive) return;
    this.uiQueue[this.uiLen] = quad;
    this.uiLen += 1;
  }

  endUI(): void {
    this.uiActive = false;
  }

  /** Current device-pixel-ratio (matches beginFrame's backing-store sizing). */
  private currentDpr(): number {
    return Math.min((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1, 2);
  }

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

  endFrame(
    wash?: { color: string; alpha: number },
    particles?: ParticleSystem,
    weather?: { count: number; draw(ctx: Ctx2D): void },
    overlay?: OverlayFn,
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

    const visL = Math.max(0, left);
    const visT = Math.max(0, top);
    const visR = Math.min(this.staticLayerW, left + camera.worldUnitsX);
    const visB = Math.min(this.staticLayerH, top + camera.worldUnitsY);
    const visW = Math.max(0, visR - visL);
    const visH = Math.max(0, visB - visT);

    if (this.waterPattern && this.staticLayerW > 0 && visW > 0 && visH > 0) {
      ctx.globalAlpha = 1;

      if (typeof DOMMatrix !== "undefined" && this.waterPattern.setTransform) {
        this.waterPattern.setTransform(
          new DOMMatrix([1, 0, 0, 1, this.waterOffsetX, this.waterOffsetY]),
        );
      }

      const waterSmooth = sx < 1;
      if (waterSmooth) ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = this.waterPattern;
      ctx.fillRect(visL, visT, visW, visH);

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

    if (this.staticLayer && this.staticRegion && visW > 0 && visH > 0) {
      const blit = staticBlitRect(visL, visT, visR, visB, this.staticRegion);
      if (blit) {
        ctx.globalAlpha = 1;
        ctx.drawImage(
          this.staticLayer,
          blit.srcX, blit.srcY, blit.srcW, blit.srcH,
          blit.dstL, blit.dstT, blit.dstW, blit.dstH,
        );
      }
    }

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

    if (weather && weather.count > 0) {
      weather.draw(ctx);
    }

    if (wash && wash.alpha > 0.001) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = wash.alpha;
      ctx.fillStyle = wash.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    if (overlay) {
      ctx.setTransform(sx, 0, 0, sy, ox, oy);
      overlay(ctx, { sx, sy, ox, oy });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // Screen-space UI layer: drawn last, in identity (screen) transform so it is
    // unaffected by the world camera. drawUIQuad applies DPR scaling internally.
    if (this.uiLen > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      const dpr = this.currentDpr();
      for (let i = 0; i < this.uiLen; i += 1) {
        drawUIQuad(ctx, this.atlases, this.uiQueue[i]!, dpr);
      }
      ctx.globalAlpha = 1;
    }
  }
}
