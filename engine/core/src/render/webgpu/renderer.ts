
import type { Camera2D } from "../camera";
import type { LoadedAtlasImage } from "../../assets/loader";
import type { ParticleSystem } from "../particles";
import type { RendererLike, WashOptions, WeatherLike, DecorateFn, Sprite, OverlayFn, UIQuad } from "../renderer";
import { drawUIQuad } from "../ui-draw";
import type { StaticRegion } from "../static-region";
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
import { CloudShadowPass } from "./cloud-shadow-pass";
import type { CloudOptions } from "../renderer";
import { RainField } from "../rain-field";
import { compareSprite, spritesOverlap } from "../canvas2d/draw";

const CULL_MARGIN = 32;
const GHOST_ALPHA = 0.4;     
const GHOST_UI_LAYER = 80;   

interface ShadowRecord {
  x: number; y: number; rx: number; ry: number; alpha: number;
}

interface DrawGroup {
  bindGroup: GPUBindGroup | null;
  first: number;
  count: number;
}

function hexToRgbaFloats(hex: string, alpha = 1): [number, number, number, number] {
  let c = hex.trim();
  if (c.startsWith("#")) c = c.slice(1);

  if (c.length === 3) c = c[0]! + c[0]! + c[1]! + c[1]! + c[2]! + c[2]!;
  const n = parseInt(c, 16);
  return [
    ((n >> 16) & 0xff) / 255,
    ((n >> 8) & 0xff) / 255,
    (n & 0xff) / 255,
    alpha,
  ];
}

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
  private readonly _cloudPass: CloudShadowPass;

  private _cloudOpts: CloudOptions | undefined = undefined;

  useGpuEffects = true;

  private readonly _atlases: Map<string, LoadedAtlasImage> = new Map();

  private _queue: Sprite[] = [];
  private _queueLen = 0;

  private _shadowQueue: ShadowRecord[] = [];
  private _shadowLen = 0;

  // Screen-space UI draw-list, flushed via the Overlay2D layer in endFrame.
  private _uiQueue: UIQuad[] = [];
  private _uiLen = 0;
  private _uiActive = false;

  // Dev-only UI-flush profiling seam (see RendererLike.profileUi). Off by default;
  // the host flips it when profiling so production frames pay nothing.
  profileUi = false;
  lastUiFlush = { ms: 0, quads: 0 };

  private _occludableIdx: number[] = [];

  private _groups: DrawGroup[] = [];
  private _groupLen = 0;

  private readonly _inst: GpuSpriteInstance = {
    x: 0, y: 0, w: 0, h: 0,
    u0: 0, v0: 0, u1: 0, v1: 0,
    rotation: 0, flipX: 0,
    r: 1, g: 1, b: 1, a: 1,
    swayPhase: 0, swayAmp: 0,
  };

  private _cullLeft = -Infinity;
  private _cullRight = Infinity;
  private _cullTop = -Infinity;
  private _cullBottom = Infinity;

  private _staticLayerW = 0;
  private _staticLayerH = 0;

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
    cloudPass: CloudShadowPass,
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
    this._cloudPass = cloudPass;

    gpuCtx.device.lost.then((info: GPUDeviceLostInfo) => {
      console.warn(`webgpu: device lost — reason: ${info.reason}, message: ${info.message}`);
      this._deviceLost = true;
    }).catch(() => {

    });
  }

  static async create(canvas: HTMLCanvasElement, camera: Camera2D): Promise<WebGpuRenderer> {
    const gpuCtx = await GpuContext.create(canvas);
    const { device } = gpuCtx;

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
    const cloudPass = new CloudShadowPass(gpuCtx);
    const validationError = await device.popErrorScope();
    if (validationError) {
      throw new Error(`webgpu: pipeline/shader validation failed — ${validationError.message}`);
    }

    return new WebGpuRenderer(
      canvas, camera, gpuCtx, store, batch, shadowBatch, overlay, staticPass, waterPass, particleBatch, weatherPass, tintPass, cloudPass,
    );
  }

  addAtlas(atlas: LoadedAtlasImage): void {
    this._atlases.set(atlas.manifest.id, atlas);

    if (this._deviceLost) return;
    this._store.add(atlas);
  }

  setAtlas(atlas: LoadedAtlasImage): void {
    this.addAtlas(atlas);
  }

  getAtlas(id: string): LoadedAtlasImage | undefined {
    return this._atlases.get(id);
  }

  bakeStaticLayer(
    sprites: readonly Sprite[],
    worldWidth: number,
    worldHeight: number,
    decorate?: DecorateFn,
    region?: StaticRegion,
  ): void {
    if (this._atlases.size === 0) throw new Error("bakeStaticLayer: addAtlas must be called first");
    if (this._deviceLost) return;
    this._staticPass.bake(sprites, this._atlases, worldWidth, worldHeight, decorate, region);
    // _staticLayerW/H stay the LOGICAL world extent (visible-rect clamp); the
    // baked texture may be a smaller sub-region (the pass tracks that itself).
    this._staticLayerW = Math.max(1, Math.ceil(worldWidth));
    this._staticLayerH = Math.max(1, Math.ceil(worldHeight));
  }

  bakeWaterPattern(frame: string, atlasId: string, tileSize: number, pixelScale?: number): void {
    if (this._atlases.size === 0) throw new Error("bakeWaterPattern: addAtlas must be called first");
    if (this._deviceLost) return; 
    this._waterPass.bakePattern(this._atlases, frame, atlasId, tileSize, pixelScale);
  }

  setWaterScroll(offsetX: number, offsetY: number): void {
    this._waterPass.setScroll(offsetX, offsetY);
  }

  setWaterSwell(alpha: number, offsetX: number, offsetY: number): void {
    this._waterPass.setSwell(alpha, offsetX, offsetY);
  }

  setWaterDepthMask(
    data: Uint8Array,
    tilesX: number,
    tilesY: number,
    worldWidthPx: number,
    worldHeightPx: number,
    tilePxSize: number,
  ): void {
    if (this._deviceLost) return;
    this._waterPass.setDepthMask(data, tilesX, tilesY, worldWidthPx, worldHeightPx, tilePxSize);
  }

  clearStaticLayer(): void {
    this._staticPass.clear();
    this._staticLayerW = 0;
    this._staticLayerH = 0;
  }

  setCloudOptions(opts: CloudOptions): void {
    this._cloudOpts = opts;
  }

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
    // Reset the UI draw-list too: it's otherwise only cleared in beginUI(), so a
    // consumer that stops calling beginUI would re-draw its last UI quads forever.
    this._uiLen = 0;

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
    const halfW = sprite.width / 2;
    const halfH = sprite.height / 2;
    if (
      sprite.x + halfW < this._cullLeft ||
      sprite.x - halfW > this._cullRight ||
      sprite.y + halfH < this._cullTop ||
      sprite.y - halfH > this._cullBottom
    ) return;
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

  beginUI(): void {
    this._uiActive = true;
    this._uiLen = 0;
  }

  pushUI(quad: UIQuad): void {
    if (!this._uiActive) return;
    this._uiQueue[this._uiLen] = quad;
    this._uiLen += 1;
  }

  endUI(): void {
    this._uiActive = false;
  }

  private _ghostCovered(queueIdx: number, g: Sprite): boolean {
    for (let jj = queueIdx + 1; jj < this._queueLen; jj += 1) {
      const o = this._queue[jj];
      if (o === undefined) continue;
      if (o.occludable || o.layer >= GHOST_UI_LAYER) continue;
      if (spritesOverlap(g, o)) return true;
    }
    return false;
  }

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

  private _packSprite(
    s: Sprite,
    sx: number, sy: number, ox: number, oy: number,
    alpha: number,
  ): number {

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

    inst.swayPhase = s.swayPhase ?? 0;
    inst.swayAmp   = s.swayAmp   ?? 0;

    return this._batch.add(inst);
  }

  endFrame(wash?: WashOptions, particles?: ParticleSystem, weather?: WeatherLike, _overlay?: OverlayFn): void {
    if (this._deviceLost) return;
    if (this._atlases.size === 0) return;

    const { camera } = this;
    const canvas = this._canvas;
    const canvasW = canvas.width;
    const canvasH = canvas.height;

    const sx = canvasW / camera.worldUnitsX;
    const sy = canvasH / camera.worldUnitsY;
    const left = camera.centerX - camera.worldUnitsX / 2;
    const top  = camera.centerY - camera.worldUnitsY / 2;
    const ox = this.pixelSnap ? Math.round(-left * sx) : -left * sx;
    const oy = this.pixelSnap ? Math.round(-top  * sy) : -top  * sy;

    const nowSec = performance.now() / 1000;
    const gpuView: ViewUniform = {
      scaleX:  sx * 2 / canvasW,
      scaleY: -sy * 2 / canvasH,
      offsetX: ox * 2 / canvasW - 1,
      offsetY: 1 - oy * 2 / canvasH,
      timeSec: nowSec,

      windStrength: 1.0 + 0.15 * Math.sin(nowSec * 0.37),
    };
    this._gpuCtx.setView(gpuView);

    const overlayView: ViewUniform = {
      scaleX:  sx,
      scaleY:  sy, 
      offsetX: ox,
      offsetY: oy,

      timeSec: 0,
      windStrength: 1,
    };

    const visL = Math.max(0, left);
    const visT = Math.max(0, top);
    const visR = Math.min(this._staticLayerW, left + camera.worldUnitsX);
    const visB = Math.min(this._staticLayerH, top  + camera.worldUnitsY);
    const visRect: VisibleRect = { visL, visT, visR, visB };

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

      let j = i;
      while (j < this._queueLen) {
        const sp = this._queue[j];
        if (sp === undefined || sp.atlasId !== currentAtlas) break;

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

    // Ghost redraws are packed in occludableIdx (ascending queue-index) order, so
    // consecutive covered ghosts sharing an atlas land contiguously in the batch
    // and can share one draw group — mirrors the main-pass coalescing loop above.
    let k = 0;
    while (k < occludableCount) {
      const gi = this._occludableIdx[k];
      if (gi === undefined) { k += 1; continue; }
      const g = this._queue[gi];
      if (g === undefined) { k += 1; continue; }
      if (!this._ghostCovered(gi, g)) { k += 1; continue; }

      const currentAtlas = g.atlasId;
      const groupFirst = this._batch.count;
      this._packSprite(g, sx, sy, ox, oy, g.alpha * GHOST_ALPHA);

      let m = k + 1;
      while (m < occludableCount) {
        const gi2 = this._occludableIdx[m];
        if (gi2 === undefined) break;
        const g2 = this._queue[gi2];
        if (g2 === undefined || g2.atlasId !== currentAtlas) break;
        if (!this._ghostCovered(gi2, g2)) break;
        this._packSprite(g2, sx, sy, ox, oy, g2.alpha * GHOST_ALPHA);
        m += 1;
      }

      const groupCount = this._batch.count - groupFirst;
      this._recordGroup(currentAtlas, groupFirst, groupCount);
      k = m;
    }

    this._batch.upload();

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

    const clearRgba = hexToRgbaFloats(this.clearColor);
    const encoder = this._gpuCtx.device.createCommandEncoder({ label: "frame" });
    const pass = this._gpuCtx.beginPass(encoder, clearRgba);

    pass.setBindGroup(0, this._gpuCtx.viewBindGroup());

    const zoomedOut = sx < 1;
    this._waterPass.draw(pass, gpuView, visRect, zoomedOut);
    this._staticPass.draw(pass, gpuView, visRect);

    this._shadowBatch.draw(pass);

    for (let gIdx = 0; gIdx < this._groupLen; gIdx += 1) {
      const grp = this._groups[gIdx];
      if (grp === undefined || grp.bindGroup === null) continue;
      this._batch.drawRange(pass, grp.bindGroup, grp.first, grp.count);
    }

    if (this.useGpuEffects) {
      if (particles && particles.count > 0) {
        this._particleBatch.draw(pass, particles);
      }

      if (weather instanceof RainField && weather.count > 0) {
        this._weatherPass.draw(pass, weather);
      }
    }

    if (this._cloudOpts !== undefined && this._cloudOpts.coverage > 0.001) {
      this._cloudPass.draw(pass, this._cloudOpts);
    }

    this._cloudOpts = undefined;

    if (wash && wash.alpha > 0.001) {
      this._tintPass.draw(pass, wash.color, wash.alpha);
    }

    pass.end();
    this._gpuCtx.queue.submit([encoder.finish()]);

    this._overlay.beginFrame();
    const overlayCtx = this._overlay.ctx;

    if (!this.useGpuEffects || (weather && !(weather instanceof RainField) && weather.count > 0)) {
      this._overlay.applyWorldTransform(overlayView);
      if (!this.useGpuEffects) {
        if (particles && particles.count > 0) particles.draw(overlayCtx);
        if (weather && weather.count > 0) weather.draw(overlayCtx);
      } else if (weather && weather.count > 0) {
        weather.draw(overlayCtx);
      }
    }

    // Screen-space UI layer: drawn last, in identity (screen) transform on the
    // Overlay2D canvas which sits one z-index above the GPU canvas. Unaffected by
    // the world camera. drawUIQuad applies DPR scaling internally.
    const uiFlushT0 = this.profileUi ? performance.now() : 0;
    if (this._uiLen > 0) {
      this._overlay.resetTransform();
      // Force nearest-neighbour: applyWorldTransform (the only per-frame place that sets
      // this false) is skipped when no particles/weather are active, so a (re)sized backing
      // store leaves smoothing at its default `true` → blurry scaled UI. Pin it false here
      // so UI is always pixel-crisp and identical to the Canvas2D path.
      overlayCtx.imageSmoothingEnabled = false;
      overlayCtx.globalCompositeOperation = "source-over";
      const dpr = Math.min(
        (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1,
        2,
      );
      for (let i = 0; i < this._uiLen; i += 1) {
        drawUIQuad(overlayCtx, this._atlases, this._uiQueue[i]!, dpr);
      }
      overlayCtx.globalAlpha = 1;
    }
    if (this.profileUi) {
      this.lastUiFlush.ms = performance.now() - uiFlushT0;
      this.lastUiFlush.quads = this._uiLen;
    }
  }
}

export async function tryCreateWebGpuRenderer(
  canvas: HTMLCanvasElement,
  camera: Camera2D,
): Promise<RendererLike> {
  return WebGpuRenderer.create(canvas, camera);
}
