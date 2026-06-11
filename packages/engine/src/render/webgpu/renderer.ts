/// <reference types="@webgpu/types" />
import type { Camera2D } from "../camera";
import type { LoadedAtlasImage } from "../../assets/loader";
import type { ParticleSystem } from "../particles";
import type { RendererLike, WashOptions, WeatherLike, DecorateFn, Sprite } from "../renderer";
import { EDG } from "../palette";
import { GpuContext } from "./gpu-context";
import type { ViewUniform } from "./gpu-context";
import { GpuAtlasStore } from "./texture-atlas";
import { SpriteBatch } from "./sprite-batch";
import type { GpuSpriteInstance } from "./sprite-batch";
import { Overlay2D } from "./overlay-2d";
import { StaticLayerPass, WaterPass } from "./static-layer-pass";
import type { VisibleRect } from "./static-layer-pass";
import { compareSprite, spritesOverlap } from "../canvas2d/draw";

// ── Constants (mirrored from Canvas2dRenderer — keep in sync) ─────────────────
const CULL_MARGIN = 32;
const GHOST_ALPHA = 0.4;     // re-draw alpha for an occluded flagged sprite
const GHOST_UI_LAYER = 80;   // overlappers at/above this layer never occlude

// ── Shadow queue record (pooled to avoid per-frame alloc) ─────────────────────
interface ShadowRecord {
  x: number; y: number; rx: number; ry: number; alpha: number;
}

// ── Tiny runtime hex → rgba float helper ──────────────────────────────────────
// Never called with a literal — always called with an EDG.* string or consumer-supplied string.
// Returns [r, g, b, a] each in 0..1.  Alpha arg is the composite alpha (from WashOptions etc.).
function hexToRgbaFloats(hex: string, alpha = 1): [number, number, number, number] {
  let c = hex.trim();
  if (c.startsWith("#")) c = c.slice(1);
  // Support 3-char shorthand
  if (c.length === 3) c = c[0]! + c[0]! + c[1]! + c[1]! + c[2]! + c[2]!;
  const n = parseInt(c, 16);
  return [
    ((n >> 16) & 0xff) / 255,
    ((n >> 8) & 0xff) / 255,
    (n & 0xff) / 255,
    alpha,
  ];
}

// ── tintRgba → (r, g, b, a) floats in 0..1 ───────────────────────────────────
function tintFloats(tintRgba: number | undefined, spriteAlpha: number): [number, number, number, number] {
  const t = tintRgba !== undefined ? (tintRgba >>> 0) : 0xffffffff;
  const r = ((t >>> 24) & 0xff) / 255;
  const g = ((t >>> 16) & 0xff) / 255;
  const b = ((t >>> 8)  & 0xff) / 255;
  const tAlpha = (t & 0xff) / 255;
  return [r, g, b, spriteAlpha * tAlpha];
}

export class WebGpuRenderer implements RendererLike {
  readonly camera: Camera2D;
  clearColor: string;
  pixelSnap: boolean;

  private readonly _canvas: HTMLCanvasElement;
  private readonly _gpuCtx: GpuContext;
  private readonly _store: GpuAtlasStore;
  private readonly _batch: SpriteBatch;
  private readonly _overlay: Overlay2D;
  private readonly _staticPass: StaticLayerPass;
  private readonly _waterPass: WaterPass;

  // CPU-side atlas map: required for bakeStaticLayer/bakeWaterPattern (StaticLayerPass/WaterPass
  // expect a Map<string, LoadedAtlasImage>) AND for getAtlas() (must survive GPU upload).
  // This is the canonical reconciliation for point 2 in the wave-2 brief.
  private readonly _atlases: Map<string, LoadedAtlasImage> = new Map();

  // Sprite queue — reused across frames (reset by length, not reallocated).
  // queueLen is the live count; entries past queueLen are stale and ignored.
  private _queue: Sprite[] = [];
  private _queueLen = 0;

  // Shadow queue — pooled records to avoid per-frame alloc.
  private _shadowQueue: ShadowRecord[] = [];
  private _shadowLen = 0;

  // Scratch index array for the x-ray pass.
  private _occludableIdx: number[] = [];

  // Viewport culling rect — generous defaults until first beginFrame.
  private _cullLeft = -Infinity;
  private _cullRight = Infinity;
  private _cullTop = -Infinity;
  private _cullBottom = Infinity;

  // Cached static-layer dimensions for visible-rect clipping.
  private _staticLayerW = 0;
  private _staticLayerH = 0;

  // Device-loss guard: stop drawing if device is lost.
  private _deviceLost = false;

  private constructor(
    canvas: HTMLCanvasElement,
    camera: Camera2D,
    gpuCtx: GpuContext,
    store: GpuAtlasStore,
    batch: SpriteBatch,
    overlay: Overlay2D,
    staticPass: StaticLayerPass,
    waterPass: WaterPass,
  ) {
    this.camera = camera;
    this.clearColor = EDG.black;
    this.pixelSnap = true;
    this._canvas = canvas;
    this._gpuCtx = gpuCtx;
    this._store = store;
    this._batch = batch;
    this._overlay = overlay;
    this._staticPass = staticPass;
    this._waterPass = waterPass;

    // Log device loss and stop the draw loop gracefully.
    gpuCtx.device.lost.then((info: GPUDeviceLostInfo) => {
      console.warn(`webgpu: device lost — reason: ${info.reason}, message: ${info.message}`);
      this._deviceLost = true;
    }).catch(() => {
      // Swallow unexpected rejection to avoid unhandled-rejection noise.
    });
  }

  /** Async factory: create GpuContext then wire all collaborators. Throws on any failure. */
  static async create(canvas: HTMLCanvasElement, camera: Camera2D): Promise<WebGpuRenderer> {
    const gpuCtx = await GpuContext.create(canvas);
    const store = new GpuAtlasStore(gpuCtx.device);
    const batch = new SpriteBatch(gpuCtx, store.bindGroupLayout());
    const overlay = new Overlay2D(canvas);
    const staticPass = new StaticLayerPass(gpuCtx);
    const waterPass = new WaterPass(gpuCtx);
    return new WebGpuRenderer(canvas, camera, gpuCtx, store, batch, overlay, staticPass, waterPass);
  }

  // ── RendererLike: atlas management ────────────────────────────────────────────

  addAtlas(atlas: LoadedAtlasImage): void {
    this._atlases.set(atlas.manifest.id, atlas);
    this._store.add(atlas);
  }

  setAtlas(atlas: LoadedAtlasImage): void {
    this.addAtlas(atlas);
  }

  getAtlas(id: string): LoadedAtlasImage | undefined {
    return this._atlases.get(id);
  }

  // ── RendererLike: static layer + water ────────────────────────────────────────

  bakeStaticLayer(
    sprites: readonly Sprite[],
    worldWidth: number,
    worldHeight: number,
    decorate?: DecorateFn,
  ): void {
    if (this._atlases.size === 0) throw new Error("bakeStaticLayer: addAtlas must be called first");
    this._staticPass.bake(sprites, this._atlases, worldWidth, worldHeight, decorate);
    this._staticLayerW = Math.max(1, Math.ceil(worldWidth));
    this._staticLayerH = Math.max(1, Math.ceil(worldHeight));
  }

  bakeWaterPattern(frame: string, atlasId: string, tileSize: number, pixelScale?: number): void {
    if (this._atlases.size === 0) throw new Error("bakeWaterPattern: addAtlas must be called first");
    this._waterPass.bakePattern(this._atlases, frame, atlasId, tileSize, pixelScale);
  }

  setWaterScroll(offsetX: number, offsetY: number): void {
    this._waterPass.setScroll(offsetX, offsetY);
  }

  setWaterSwell(alpha: number, offsetX: number, offsetY: number): void {
    this._waterPass.setSwell(alpha, offsetX, offsetY);
  }

  clearStaticLayer(): void {
    this._staticPass.clear();
    this._staticLayerW = 0;
    this._staticLayerH = 0;
  }

  // ── RendererLike: per-frame begin/push/end ────────────────────────────────────

  beginFrame(): void {
    const dpr = Math.min(
      (typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1),
      2,
    );
    const desiredW = Math.max(1, Math.floor(this._canvas.clientWidth * dpr));
    const desiredH = Math.max(1, Math.floor(this._canvas.clientHeight * dpr));
    this._gpuCtx.resize(desiredW, desiredH);

    this._queueLen = 0;
    this._shadowLen = 0;

    const { camera } = this;
    const halfX = camera.worldUnitsX / 2;
    const halfY = camera.worldUnitsY / 2;
    this._cullLeft   = camera.centerX - halfX - CULL_MARGIN;
    this._cullRight  = camera.centerX + halfX + CULL_MARGIN;
    this._cullTop    = camera.centerY - halfY - CULL_MARGIN;
    this._cullBottom = camera.centerY + halfY + CULL_MARGIN;
  }

  private _inView(x: number, y: number): boolean {
    return (
      x >= this._cullLeft &&
      x <= this._cullRight &&
      y >= this._cullTop &&
      y <= this._cullBottom
    );
  }

  push(sprite: Sprite): void {
    if (!this._inView(sprite.x, sprite.y)) return;
    this._queue[this._queueLen] = sprite;
    this._queueLen += 1;
  }

  pushShadow(x: number, y: number, rx: number, ry: number, alpha: number): void {
    if (!this._inView(x, y)) return;
    let rec = this._shadowQueue[this._shadowLen];
    if (rec === undefined) {
      rec = { x, y, rx, ry, alpha };
      this._shadowQueue[this._shadowLen] = rec;
    } else {
      rec.x = x; rec.y = y; rec.rx = rx; rec.ry = ry; rec.alpha = alpha;
    }
    this._shadowLen += 1;
  }

  endFrame(wash?: WashOptions, particles?: ParticleSystem, weather?: WeatherLike): void {
    if (this._deviceLost) return;
    if (this._atlases.size === 0) return;

    const { camera } = this;
    const canvas = this._canvas;
    const canvasW = canvas.width;
    const canvasH = canvas.height;

    // ── Step 1: compute view transform ───────────────────────────────────────
    // Mirror Canvas2dRenderer.endFrame pixel-snap math exactly.
    const sx = canvasW / camera.worldUnitsX;
    const sy = canvasH / camera.worldUnitsY;
    const left = camera.centerX - camera.worldUnitsX / 2;
    const top  = camera.centerY - camera.worldUnitsY / 2;
    const ox = this.pixelSnap ? Math.round(-left * sx) : -left * sx;
    const oy = this.pixelSnap ? Math.round(-top  * sy) : -top  * sy;

    // Canonical clip-space view uniform:
    //   scaleX  =  sx * 2 / canvasW    scaleY  = -sy * 2 / canvasH
    //   offsetX =  ox * 2 / canvasW - 1         offsetY = 1 - oy * 2 / canvasH
    // Shader: clipPos = vec2(worldX * scaleX + offsetX, worldY * scaleY + offsetY)
    const gpuView: ViewUniform = {
      scaleX:  sx * 2 / canvasW,
      scaleY: -sy * 2 / canvasH,
      offsetX: ox * 2 / canvasW - 1,
      offsetY: 1 - oy * 2 / canvasH,
    };
    this._gpuCtx.setView(gpuView);

    // Pixel-space "view" for Overlay2D.applyWorldTransform — uses the same sx/sy/ox/oy
    // but expressed in device-pixel scale/translation so ctx.setTransform works correctly.
    // Overlay2D.applyWorldTransform does: ctx.setTransform(v.scaleX, 0, 0, v.scaleY, v.offsetX, v.offsetY)
    // We need scaleX=sx, scaleY=sy (positive!), offsetX=ox, offsetY=oy.
    // We exploit TypeScript structural typing: the ViewUniform interface only specifies the
    // field names — passing pixel-space values here is intentional.
    const overlayView: ViewUniform = {
      scaleX:  sx,
      scaleY:  sy, // positive: Canvas2D Y increases downward, matches world space
      offsetX: ox,
      offsetY: oy,
    };

    // ── Step 2: visible rect (mirrors Canvas2dRenderer.endFrame) ─────────────
    const visL = Math.max(0, left);
    const visT = Math.max(0, top);
    const visR = Math.min(this._staticLayerW, left + camera.worldUnitsX);
    const visB = Math.min(this._staticLayerH, top  + camera.worldUnitsY);
    const visRect: VisibleRect = { visL, visT, visR, visB };

    // ── Step 3: clear + render pass ──────────────────────────────────────────
    const clearRgba = hexToRgbaFloats(this.clearColor);
    const encoder = this._gpuCtx.device.createCommandEncoder({ label: "frame" });
    const pass = this._gpuCtx.beginPass(encoder, clearRgba);

    // Set view bind group once for ALL subsequent GPU draw calls in this pass.
    pass.setBindGroup(0, this._gpuCtx.viewBindGroup());

    // ── Step 4: water (under static), then static layer ───────────────────────
    const zoomedOut = sx < 1;
    this._waterPass.draw(pass, gpuView, visRect, zoomedOut);
    this._staticPass.draw(pass, gpuView, visRect);

    // ── Step 5: GPU shadows — dark translucent quads scaled to ellipse bounds ─
    // Drawn via the sprite batch using a 1×1 white atlas pixel scaled to shadow dimensions,
    // with a very dark tint and the shadow's alpha. Since we have no dedicated shadow texture,
    // we use the sprite pipeline with a near-black tint and premultiplied alpha blend.
    // The approach: draw a filled rect (w=2*rx, h=2*ry) centered at (x, y) using the
    // sprite batch with a single-pixel white texture. However, we don't have a guaranteed
    // 1×1 white frame in every atlas. Instead, we render shadows on the overlay canvas
    // using "source-over" blending (not "multiply" — see overlay-2d.ts §"Shadows decision").
    // The overlay starts transparent, so we use a dark semi-transparent fill which is
    // visually close enough. This is the deferred GPU-side shadow from Wave 1d.
    // NOTE: we render these BEFORE sprites in the GPU pass would require a dedicated
    // shadow pipeline; we instead render them on the overlay (before the world transform
    // is applied to overlay) using screen-space math. See overlay block below.

    // ── Step 6: sort + x-ray sprite pass ─────────────────────────────────────
    if (this._queue.length !== this._queueLen) this._queue.length = this._queueLen;
    this._queue.sort(compareSprite);

    // Group sprites by atlasId and flush per group.
    // Per-group instance array (reused across atlas groups within a frame).
    const groupInstances: GpuSpriteInstance[] = [];
    let occludableCount = 0;

    let i = 0;
    while (i < this._queueLen) {
      const s = this._queue[i];
      if (s === undefined) { i++; continue; }
      const currentAtlas = s.atlasId;

      // Collect all consecutive sprites for this atlasId.
      groupInstances.length = 0;
      let j = i;
      while (j < this._queueLen) {
        const sp = this._queue[j];
        if (sp === undefined || sp.atlasId !== currentAtlas) break;

        // Accumulate occludable indices (into original sorted-queue positions).
        if (sp.occludable) {
          this._occludableIdx[occludableCount] = j;
          occludableCount += 1;
        }

        // Build GpuSpriteInstance from Canvas2dSprite.
        // Apply z-lift (screenY = y - z) and pixel-snap, mirroring drawQueued.
        const liftedY = sp.z ? sp.y - sp.z : sp.y;
        const px = this.pixelSnap ? (Math.round(sp.x * sx + ox) - ox) / sx : sp.x;
        const py = this.pixelSnap ? (Math.round(liftedY * sy + oy) - oy) / sy : liftedY;

        const uv = this._store.uv(sp.atlasId, sp.frame);
        const [r, g, b, a] = tintFloats(sp.tintRgba, sp.alpha);

        groupInstances.push({
          x: px, y: py,
          w: sp.width, h: sp.height,
          u0: uv.u0, v0: uv.v0, u1: uv.u1, v1: uv.v1,
          rotation: sp.rotation,
          flipX: sp.flipX ? 1 : 0,
          r, g, b, a,
        });

        j++;
      }

      if (groupInstances.length > 0) {
        const atlasBindGroup = this._store.bindGroup(currentAtlas);
        this._batch.flush(pass, atlasBindGroup, groupInstances);
      }

      i = j;
    }

    // ── Step 6b: x-ray ghost pass ─────────────────────────────────────────────
    // Re-emit occludable sprites at GHOST_ALPHA when covered by a later world sprite.
    // Reuse groupInstances scratch for each ghost.
    for (let k = 0; k < occludableCount; k += 1) {
      const gi = this._occludableIdx[k];
      if (gi === undefined) continue;
      const g = this._queue[gi];
      if (g === undefined) continue;

      let covered = false;
      for (let jj = gi + 1; jj < this._queueLen && !covered; jj += 1) {
        const o = this._queue[jj];
        if (o === undefined) continue;
        if (o.occludable || o.layer >= GHOST_UI_LAYER) continue;
        if (spritesOverlap(g, o)) covered = true;
      }

      if (covered) {
        const liftedY = g.z ? g.y - g.z : g.y;
        const px = this.pixelSnap ? (Math.round(g.x * sx + ox) - ox) / sx : g.x;
        const py = this.pixelSnap ? (Math.round(liftedY * sy + oy) - oy) / sy : liftedY;
        const uv = this._store.uv(g.atlasId, g.frame);
        const [r, gg, b] = tintFloats(g.tintRgba, 1);
        const ghostInst: GpuSpriteInstance = {
          x: px, y: py,
          w: g.width, h: g.height,
          u0: uv.u0, v0: uv.v0, u1: uv.u1, v1: uv.v1,
          rotation: g.rotation,
          flipX: g.flipX ? 1 : 0,
          r, g: gg, b,
          a: g.alpha * GHOST_ALPHA,
        };
        groupInstances.length = 0;
        groupInstances.push(ghostInst);
        this._batch.flush(pass, this._store.bindGroup(g.atlasId), groupInstances);
      }
    }

    // ── Step 7: end GPU pass ──────────────────────────────────────────────────
    pass.end();
    this._gpuCtx.queue.submit([encoder.finish()]);

    // ── Step 8: overlay (shadows, particles, weather, wash) ──────────────────
    this._overlay.beginFrame();

    // Shadows on the overlay (source-over at alpha, dark fill).
    // Using source-over rather than multiply because the overlay is transparent;
    // multiply on transparent produces transparent, not a darkened composite
    // (see corpus/briefs/engine/todo/webgpu/wave-1d-overlay-2d.md §"Shadows decision").
    // We apply the world transform first so shadow coordinates are in world space.
    this._overlay.applyWorldTransform(overlayView);
    const overlayCtx = this._overlay.ctx;
    if (this._shadowLen > 0) {
      overlayCtx.globalCompositeOperation = "source-over";
      // Shadow color: use a very dark fill parsed from EDG.black at runtime (no hex literal).
      const [sr, sg, sb] = hexToRgbaFloats(EDG.black);
      for (let si = 0; si < this._shadowLen; si += 1) {
        const sh = this._shadowQueue[si];
        if (sh === undefined) continue;
        overlayCtx.globalAlpha = sh.alpha * 0.7; // darken under source-over on transparent bg
        overlayCtx.fillStyle = `rgb(${Math.round(sr * 255)},${Math.round(sg * 255)},${Math.round(sb * 255)})`;
        overlayCtx.beginPath();
        overlayCtx.ellipse(sh.x, sh.y, sh.rx, sh.ry, 0, 0, Math.PI * 2);
        overlayCtx.fill();
      }
      overlayCtx.globalAlpha = 1;
      overlayCtx.globalCompositeOperation = "source-over";
    }

    // Particles (world space — transform already applied).
    if (particles && particles.count > 0) {
      particles.draw(overlayCtx);
    }

    // Weather curtain (world space, drawn after particles).
    if (weather && weather.count > 0) {
      weather.draw(overlayCtx);
    }

    // Wash in screen space (transform reset).
    this._overlay.resetTransform();
    if (wash && wash.alpha > 0.001) {
      overlayCtx.globalCompositeOperation = "source-over";
      overlayCtx.globalAlpha = wash.alpha;
      const [wr, wg, wb] = hexToRgbaFloats(wash.color); // runtime parse — no literal
      overlayCtx.fillStyle = `rgb(${Math.round(wr * 255)},${Math.round(wg * 255)},${Math.round(wb * 255)})`;
      overlayCtx.fillRect(0, 0, this._overlay.ctx.canvas.width, this._overlay.ctx.canvas.height);
      overlayCtx.globalAlpha = 1;
    }
  }
}

/**
 * Async factory — called by createRenderer when navigator.gpu is available.
 * Constructs and returns a working WebGpuRenderer.
 * Throws on any failure (no navigator.gpu, no adapter, lost device, exception).
 * The caller (createRenderer) catches and falls back to Canvas2dRenderer.
 */
export async function tryCreateWebGpuRenderer(
  canvas: HTMLCanvasElement,
  camera: Camera2D,
): Promise<RendererLike> {
  return WebGpuRenderer.create(canvas, camera);
}
