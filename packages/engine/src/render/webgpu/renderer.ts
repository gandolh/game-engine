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
import { ShadowBatch } from "./shadow-batch";
import { Overlay2D } from "./overlay-2d";
import { StaticLayerPass, WaterPass } from "./static-layer-pass";
import type { VisibleRect } from "./static-layer-pass";
import { ParticleBatch } from "./particle-batch";
import { WeatherPass } from "./weather-pass";
import { TintPass } from "./tint-pass";
import { RainField } from "../rain-field";
import { compareSprite, spritesOverlap } from "../canvas2d/draw";

// ── Constants (mirrored from Canvas2dRenderer — keep in sync) ─────────────────
const CULL_MARGIN = 32;
const GHOST_ALPHA = 0.4;     // re-draw alpha for an occluded flagged sprite
const GHOST_UI_LAYER = 80;   // overlappers at/above this layer never occlude

// ── Shadow queue record (pooled to avoid per-frame alloc) ─────────────────────
interface ShadowRecord {
  x: number; y: number; rx: number; ry: number; alpha: number;
}

// ── Sprite draw-group record (pooled to avoid per-frame alloc) ────────────────
// One record per consecutive same-atlas run in the sorted queue (plus one per
// x-ray ghost). Instances live in the SpriteBatch's frame buffer; the record
// remembers which range to draw with which atlas bind group.
interface DrawGroup {
  bindGroup: GPUBindGroup | null;
  first: number;
  count: number;
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

// ── tintRgba → (r, g, b) floats in 0..1 ──────────────────────────────────────
// The tint's alpha byte is intentionally DROPPED, mirroring Canvas2dRenderer:
// canvas2d/draw.ts only uses the RGB bytes for the multiply (`tint >>> 8`), so
// sprite opacity is s.alpha alone on both backends.
function tintFloats(tintRgba: number | undefined, spriteAlpha: number): [number, number, number, number] {
  const t = tintRgba !== undefined ? (tintRgba >>> 0) : 0xffffffff;
  const r = ((t >>> 24) & 0xff) / 255;
  const g = ((t >>> 16) & 0xff) / 255;
  const b = ((t >>> 8)  & 0xff) / 255;
  return [r, g, b, spriteAlpha];
}

export class WebGpuRenderer implements RendererLike {
  readonly camera: Camera2D;
  clearColor: string;
  pixelSnap: boolean;

  private readonly _canvas: HTMLCanvasElement;
  private readonly _gpuCtx: GpuContext;
  private readonly _store: GpuAtlasStore;
  private readonly _batch: SpriteBatch;
  private readonly _shadowBatch: ShadowBatch;
  private readonly _overlay: Overlay2D;
  private readonly _staticPass: StaticLayerPass;
  private readonly _waterPass: WaterPass;
  private readonly _particleBatch: ParticleBatch;
  private readonly _weatherPass: WeatherPass;
  private readonly _tintPass: TintPass;

  /** When true (default), particles + weather render on the GPU (Wave 4). Set false to
   *  use the 2D-overlay fallback (Wave 2 behaviour) — an A/B/safety toggle in case a GPU
   *  effect misbehaves on a given device. Shadows render GPU-side either way (they must
   *  sit UNDER sprites, which the overlay — composited on top — cannot do). The tint
   *  (day/night wash) always renders GPU-side via TintPass. */
  useGpuEffects = true;

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

  // Pooled draw-group records (consecutive same-atlas runs + ghosts).
  private _groups: DrawGroup[] = [];
  private _groupLen = 0;

  // Scratch instance reused for every SpriteBatch.add() call (zero per-sprite alloc).
  private readonly _inst: GpuSpriteInstance = {
    x: 0, y: 0, w: 0, h: 0,
    u0: 0, v0: 0, u1: 0, v1: 0,
    rotation: 0, flipX: 0,
    r: 1, g: 1, b: 1, a: 1,
  };

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
    shadowBatch: ShadowBatch,
    overlay: Overlay2D,
    staticPass: StaticLayerPass,
    waterPass: WaterPass,
    particleBatch: ParticleBatch,
    weatherPass: WeatherPass,
    tintPass: TintPass,
  ) {
    this.camera = camera;
    this.clearColor = EDG.black;
    this.pixelSnap = true;
    this._canvas = canvas;
    this._gpuCtx = gpuCtx;
    this._store = store;
    this._batch = batch;
    this._shadowBatch = shadowBatch;
    this._overlay = overlay;
    this._staticPass = staticPass;
    this._waterPass = waterPass;
    this._particleBatch = particleBatch;
    this._weatherPass = weatherPass;
    this._tintPass = tintPass;

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
    const { device } = gpuCtx;

    // Construct all collaborators (which create shader modules + pipelines) inside a
    // validation error scope. A WGSL compile error or invalid pipeline does NOT throw
    // synchronously — it surfaces as a device validation error. Capturing it here lets
    // create() throw so createRenderer() falls back to Canvas2D, instead of returning a
    // renderer that produces a blank/grey frame because the whole command buffer is invalid.
    device.pushErrorScope("validation");
    const store = new GpuAtlasStore(device);
    const batch = new SpriteBatch(gpuCtx, store.bindGroupLayout());
    const shadowBatch = new ShadowBatch(gpuCtx);
    const overlay = new Overlay2D(canvas);
    const staticPass = new StaticLayerPass(gpuCtx);
    const waterPass = new WaterPass(gpuCtx);
    const particleBatch = new ParticleBatch(gpuCtx);
    const weatherPass = new WeatherPass(gpuCtx);
    const tintPass = new TintPass(gpuCtx);
    const validationError = await device.popErrorScope();
    if (validationError) {
      throw new Error(`webgpu: pipeline/shader validation failed — ${validationError.message}`);
    }

    return new WebGpuRenderer(
      canvas, camera, gpuCtx, store, batch, shadowBatch, overlay, staticPass, waterPass, particleBatch, weatherPass, tintPass,
    );
  }

  // ── RendererLike: atlas management ────────────────────────────────────────────

  addAtlas(atlas: LoadedAtlasImage): void {
    this._atlases.set(atlas.manifest.id, atlas);
    // Skip the GPU upload after device loss — copyExternalImageToTexture throws on a
    // destroyed device, and an uncaught throw here would break the caller (e.g. the
    // sim WebSocket message handler). The CPU map stays correct for getAtlas().
    if (this._deviceLost) return;
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
    if (this._deviceLost) return; // see addAtlas — GPU uploads throw on a destroyed device
    this._staticPass.bake(sprites, this._atlases, worldWidth, worldHeight, decorate);
    this._staticLayerW = Math.max(1, Math.ceil(worldWidth));
    this._staticLayerH = Math.max(1, Math.ceil(worldHeight));
  }

  bakeWaterPattern(frame: string, atlasId: string, tileSize: number, pixelScale?: number): void {
    if (this._atlases.size === 0) throw new Error("bakeWaterPattern: addAtlas must be called first");
    if (this._deviceLost) return; // see addAtlas — GPU uploads throw on a destroyed device
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

  /** Record a draw group [first, first+count) for `atlasId` into the pooled group list. */
  private _recordGroup(atlasId: string, first: number, count: number): void {
    let rec = this._groups[this._groupLen];
    if (rec === undefined) {
      rec = { bindGroup: null, first: 0, count: 0 };
      this._groups[this._groupLen] = rec;
    }
    rec.bindGroup = this._store.bindGroup(atlasId);
    rec.first = first;
    rec.count = count;
    this._groupLen += 1;
  }

  /** Pack one sprite into the SpriteBatch via the reusable scratch instance. */
  private _packSprite(
    s: Sprite,
    sx: number, sy: number, ox: number, oy: number,
    alpha: number,
  ): number {
    // Apply z-lift (screenY = y - z) and pixel-snap, mirroring drawQueued.
    const liftedY = s.z ? s.y - s.z : s.y;
    const inst = this._inst;
    inst.x = this.pixelSnap ? (Math.round(s.x * sx + ox) - ox) / sx : s.x;
    inst.y = this.pixelSnap ? (Math.round(liftedY * sy + oy) - oy) / sy : liftedY;
    inst.w = s.width;
    inst.h = s.height;

    const uv = this._store.uv(s.atlasId, s.frame);
    inst.u0 = uv.u0; inst.v0 = uv.v0; inst.u1 = uv.u1; inst.v1 = uv.v1;
    inst.rotation = s.rotation;
    inst.flipX = s.flipX ? 1 : 0;

    const [r, g, b, a] = tintFloats(s.tintRgba, alpha);
    inst.r = r; inst.g = g; inst.b = b; inst.a = a;

    return this._batch.add(inst);
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

    // ── Step 3: pack the WHOLE frame's instance data and upload it ONCE, BEFORE
    // encoding any draw that references the buffers. queue.writeBuffer executes on
    // the queue timeline ahead of the frame's submit, so writing a buffer more than
    // once per frame would make the last write win for EVERY draw in the pass.

    // 3a. Sort + group sprites by consecutive atlasId runs.
    if (this._queue.length !== this._queueLen) this._queue.length = this._queueLen;
    this._queue.sort(compareSprite);

    this._batch.begin();
    this._groupLen = 0;
    let occludableCount = 0;

    let i = 0;
    while (i < this._queueLen) {
      const s = this._queue[i];
      if (s === undefined) { i++; continue; }
      const currentAtlas = s.atlasId;
      const groupFirst = this._batch.count;

      // Pack all consecutive sprites for this atlasId.
      let j = i;
      while (j < this._queueLen) {
        const sp = this._queue[j];
        if (sp === undefined || sp.atlasId !== currentAtlas) break;

        // Accumulate occludable indices (into original sorted-queue positions).
        if (sp.occludable) {
          this._occludableIdx[occludableCount] = j;
          occludableCount += 1;
        }

        this._packSprite(sp, sx, sy, ox, oy, sp.alpha);
        j++;
      }

      const groupCount = this._batch.count - groupFirst;
      if (groupCount > 0) {
        this._recordGroup(currentAtlas, groupFirst, groupCount);
      }

      i = j;
    }

    // 3b. X-ray ghost pass: re-emit occludable sprites at GHOST_ALPHA when covered
    // by a later world sprite. Ghosts draw after all normal sprites (one group each),
    // mirroring Canvas2dRenderer's second drawQueued loop.
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
        const first = this._packSprite(g, sx, sy, ox, oy, g.alpha * GHOST_ALPHA);
        this._recordGroup(g.atlasId, first, 1);
      }
    }

    this._batch.upload();

    // 3c. Shadows — GPU-side dark ellipses (multiply-equivalent, see shadow-batch.ts),
    // drawn between the static layer and the sprite queue exactly like Canvas2D.
    // Color is runtime-parsed from EDG.black (no literals); alpha is the queued alpha,
    // unmodified — premultiplied source-over of black at alpha a darkens by (1 - a),
    // identical to canvas multiply.
    this._shadowBatch.begin();
    if (this._shadowLen > 0) {
      const [shR, shG, shB] = hexToRgbaFloats(EDG.black);
      for (let si = 0; si < this._shadowLen; si += 1) {
        const sh = this._shadowQueue[si];
        if (sh === undefined) continue;
        this._shadowBatch.add(sh.x, sh.y, sh.rx, sh.ry, shR, shG, shB, sh.alpha);
      }
    }
    this._shadowBatch.upload();

    // ── Step 4: encode the render pass ───────────────────────────────────────
    const clearRgba = hexToRgbaFloats(this.clearColor);
    const encoder = this._gpuCtx.device.createCommandEncoder({ label: "frame" });
    const pass = this._gpuCtx.beginPass(encoder, clearRgba);

    // Set view bind group once for ALL subsequent GPU draw calls in this pass.
    pass.setBindGroup(0, this._gpuCtx.viewBindGroup());

    // 4a. Water (under static), then static layer.
    const zoomedOut = sx < 1;
    this._waterPass.draw(pass, gpuView, visRect, zoomedOut);
    this._staticPass.draw(pass, gpuView, visRect);

    // 4b. Shadows — under the sprite queue (Canvas2D order: water, static, shadows, sprites).
    this._shadowBatch.draw(pass);

    // 4c. Sprites: one instanced draw per atlas group, in y-sort order; ghost groups last.
    for (let gIdx = 0; gIdx < this._groupLen; gIdx += 1) {
      const grp = this._groups[gIdx];
      if (grp === undefined || grp.bindGroup === null) continue;
      this._batch.drawRange(pass, grp.bindGroup, grp.first, grp.count);
    }

    // 4d. GPU particles + weather (Wave 4) — in-pass, on top of sprites.
    // Order matches Canvas2D: particles first, then the weather curtain over them.
    if (this.useGpuEffects) {
      if (particles && particles.count > 0) {
        this._particleBatch.draw(pass, particles);
      }
      // Only RainField carries the GPU read API (weatherKind/forEach*). Any other
      // WeatherLike falls back to the overlay path below.
      if (weather instanceof RainField && weather.count > 0) {
        this._weatherPass.draw(pass, weather);
      }
    }

    // 4e. Full-screen tint (day/night + seasonal wash) — GPU-side, over the entire
    // scene (water, static, shadows, sprites, particles, weather). Later in-scene
    // passes (Voronoi caustics, cloud shadows — briefs 13/15) compose UNDER this tint.
    // The view bind group (group 0) is NOT needed by TintPass; it uses its own group 0.
    // We must unset the view bind group to avoid a layout mismatch: set a null-equivalent
    // by resetting is not needed since setPipeline changes the layout and the old binding
    // at slot 0 will be replaced by TintPass's setBindGroup(0, ...) below.
    if (wash && wash.alpha > 0.001) {
      this._tintPass.draw(pass, wash.color, wash.alpha);
    }

    // ── Step 5: end GPU pass ──────────────────────────────────────────────────
    pass.end();
    this._gpuCtx.queue.submit([encoder.finish()]);

    // ── Step 6: overlay (particle/weather fallback) ───────────────────────────
    // Shadows are NOT drawn here — the overlay composites on top of the GPU canvas,
    // which would put them above the sprites they belong under. They render in the
    // GPU pass (step 4b).
    //
    // The day/night wash has moved to step 4e (TintPass, GPU-side). The overlay
    // retains its remaining jobs:
    //   • Particle + weather Canvas2D fallback — when useGpuEffects is false, or for
    //     non-RainField WeatherLike that the GPU weather pass cannot read.
    // If neither job fires, beginFrame() is still called to keep the overlay canvas
    // transparent each frame (avoids stale content on the rare frames without weather).
    this._overlay.beginFrame();
    const overlayCtx = this._overlay.ctx;

    // Particles + weather: overlay fallback, used ONLY when GPU effects are disabled
    // (Wave 4 renders these in the GPU pass above). Also catches any non-RainField
    // WeatherLike, which the GPU weather pass can't read. Kept for A/B + safety.
    if (!this.useGpuEffects || (weather && !(weather instanceof RainField) && weather.count > 0)) {
      this._overlay.applyWorldTransform(overlayView);
      if (!this.useGpuEffects) {
        if (particles && particles.count > 0) particles.draw(overlayCtx);
        if (weather && weather.count > 0) weather.draw(overlayCtx);
      } else if (weather && weather.count > 0) {
        weather.draw(overlayCtx);
      }
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
