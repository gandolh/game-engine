// static-layer-pass.ts — the static layer's GL pass: one texture, or a grid of patches.
//
// The CPU bake (createOffscreen + drawSprite, sorted + decorated onto an offscreen 2D canvas) is
// backend-neutral (see ../raster2d.ts); this file uploads the result (gl.texImage2D) and blits the
// visible sub-rect (an attributeless gl.drawArrays(TRIANGLE_STRIP, 0, 4)). The patch planning is
// pure and lives in ../static-patches.ts.
//
// See ./shaders/static-layer.{vert,frag}.glsl for the shader half.

import type { GlContext } from "./gl-context";
import { compileProgram, uniformLocations } from "./program";
import type { DecorateFn, Sprite } from "../renderer";
import type { LoadedAtlasImage } from "../../assets/loader";
import { createOffscreen, compareSprite, drawSprite } from "../raster2d";
import type { Ctx2D } from "../sprite-types";
import { resolveStaticRegion, staticBlitRect } from "../static-region";
import type { StaticRegion } from "../static-region";
import {
  RING_BAKES_PER_FRAME,
  SINGLE_TEXTURE_MAX,
  patchGrid,
  patchRect,
  patchSizeFor,
  planPatches,
  spritesInRect,
  visiblePatchRange,
} from "../static-patches";
import type { PatchGrid, PatchSource, PatchedImage, StaticLayerInfo } from "../static-patches";
import type { ViewUniform } from "../view-uniform";
import staticVert from "./shaders/static-layer.vert.glsl?raw";
import staticFrag from "./shaders/static-layer.frag.glsl?raw";

export interface VisibleRect {
  visL: number;
  visT: number;
  visR: number;
  visB: number;
}

/**
 * Fail loudly if a texture exceeds this driver's `MAX_TEXTURE_SIZE`.
 *
 * WebGPU sibling: `maxTextureDimension2D` (default 8192px, and Citadel's 256×256 world lands its
 * iso texture at EXACTLY that — see ../webgpu/static-layer-pass.ts's doc comment and
 * ../webgpu/static-layer-pass.test.ts's regression case). WebGL2's limit is read from the real
 * driver via `gl.getParameter(gl.MAX_TEXTURE_SIZE)` and DIFFERS per driver — never hardcode 8192
 * here. The error message names the actual limit this call found, not an assumed one.
 */
export function assertTextureWithinLimits(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  label = "texture",
): void {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- WebGL2's getParameter is loosely typed; MAX_TEXTURE_SIZE always returns a number.
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (width > max || height > max) {
    throw new RangeError(
      `${label} is ${width}×${height}px but this device's MAX_TEXTURE_SIZE is ${max}px. ` +
        `Reduce the world size, or draw it as patches (see ../static-patches.ts).`,
    );
  }
}

/**
 * Upload an image source as an RGBA8 texture, nearest-filtered, with the given wrap mode.
 *
 * Row 0 of the source (its top) must land at texture V=0, because every vertex shader here maps
 * V=0 to the world-top edge. That is WebGL's default for every source, so `UNPACK_FLIP_Y_WEBGL`
 * is set false here: it is context-global state, and with it on, a canvas source is stored
 * bottom row first. (It is ignored for an ImageBitmap, which is why the atlases never showed it.)
 * Until 2026-11-03 this set it true, and every baked static layer was drawn upside down under
 * correctly placed sprites. Test it in a browser, not against a mock: see static-layer-pass.test.ts.
 */
function uploadImageTexture(
  gl: WebGL2RenderingContext,
  source: TexImageSource,
  width: number,
  height: number,
  wrap: number,
  label: string,
): WebGLTexture {
  assertTextureWithinLimits(gl, width, height, label);
  const tex = gl.createTexture();
  if (!tex) throw new Error(`webgl2: gl.createTexture() returned null for "${label}"`);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

const VIEW_UNIFORM_NAMES = ["u_view", "u_srcRect", "u_dstRect", "u_tex"] as const;

interface LivePatch {
  texture: WebGLTexture;
  rect: StaticRegion;
}

interface Patched {
  grid: PatchGrid;
  source: PatchSource;
  live: Map<number, LivePatch>;
  produced: number;
}

/**
 * The static layer: everything that never moves (terrain, painted ground), drawn once per frame
 * from textures.
 *
 * A layer up to 4096 px a side (`SINGLE_TEXTURE_MAX`) that the device allows is baked once into
 * one texture, exactly as before patches existed. A bigger one, or one past the device's
 * `MAX_TEXTURE_SIZE` (or the host's lower `textureLimit`), becomes a grid of patches ([../static-patches.ts](../static-patches.ts)): each
 * is baked from its own world region the first time the view touches it, one more per frame is
 * baked ahead in the ring round the view, and patches two rings out are freed.
 */
export class StaticLayerPass {
  private readonly ctx: GlContext;
  private readonly textureLimit: number;

  private program: WebGLProgram | null = null;
  private uniforms: Record<(typeof VIEW_UNIFORM_NAMES)[number], WebGLUniformLocation | null> | null =
    null;

  private texture: WebGLTexture | null = null;
  private textureW = 0;
  private textureH = 0;
  // World-px origin the baked texture covers (0,0 for a whole-world bake).
  private regionOriginX = 0;
  private regionOriginY = 0;

  private patched: Patched | null = null;

  // The shared view uniform, set once per frame via `setView` (see the doc comment on that method
  // for why this indirection exists instead of reading the `_view` param `draw` receives).
  private viewScaleX = 0;
  private viewScaleY = 0;
  private viewOffsetX = 0;
  private viewOffsetY = 0;

  /**
   * `textureLimit` lowers the device's `MAX_TEXTURE_SIZE` for this layer (a host testing how a
   * smaller device behaves); it never raises it.
   */
  constructor(ctx: GlContext, textureLimit = Number.POSITIVE_INFINITY) {
    this.ctx = ctx;
    this.textureLimit = textureLimit > 0 ? textureLimit : Number.POSITIVE_INFINITY;
  }

  private initProgram(): void {
    if (this.program) return;
    const { gl } = this.ctx;
    this.program = compileProgram(gl, staticVert, staticFrag, "static-layer");
    this.uniforms = uniformLocations(gl, this.program, VIEW_UNIFORM_NAMES);
  }

  /** The largest texture edge this layer may use: the device's, or the host's lower limit. */
  private limit(): number {
    const { gl } = this.ctx;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- WebGL2's getParameter is loosely typed; MAX_TEXTURE_SIZE always returns a number.
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    return Math.min(max, this.textureLimit);
  }

  /**
   * Set the current per-frame view transform (clip-space `ViewUniform`, `scaleY` already negative).
   *
   * WebGPU original: both passes read a device-owned `viewBindGroup()` shared across every draw in
   * the frame, so `draw`'s own `_view` parameter is unused — see that method's doc comment. WebGL2
   * has no bind-group equivalent to share a uniform across passes for free, so this method is the
   * explicit stand-in: call it once per frame (any time before `draw`) so `draw` itself can keep
   * `_view` unused, matching the original's shape instead of re-deriving a per-draw upload.
   *
   * Until this is called at least once, `draw` uses the harmless-but-wrong default of all-zero
   * scale/offset (the quad collapses to a point — nothing visible, not a crash).
   */
  setView(view: ViewUniform): void {
    this.viewScaleX = view.scaleX;
    this.viewScaleY = view.scaleY;
    this.viewOffsetX = view.offsetX;
    this.viewOffsetY = view.offsetY;
  }

  /**
   * Bake sprites (and the decorator after them) into the layer. `region` limits the bake to a
   * world sub-rect (the whole world when absent). One texture if it fits, else patches baked as
   * the view reaches them.
   */
  bake(
    sprites: readonly Sprite[],
    atlases: Map<string, LoadedAtlasImage>,
    worldWidth: number,
    worldHeight: number,
    decorate?: DecorateFn,
    region?: StaticRegion,
  ): void {
    const reg = resolveStaticRegion(worldWidth, worldHeight, region);
    const worldW = Math.max(1, Math.ceil(worldWidth));
    const worldH = Math.max(1, Math.ceil(worldHeight));
    this.clear();
    this.initProgram();
    const limit = this.limit();
    const single = Math.min(limit, SINGLE_TEXTURE_MAX);

    if (reg.width > single || reg.height > single) {
      const sorted = sprites.slice().sort(compareSprite);
      this.patched = {
        grid: patchGrid(reg, patchSizeFor(limit)),
        source: {
          produce: (_key, rect) => bakeRegion(sorted, atlases, worldW, worldH, decorate, rect),
        },
        live: new Map(),
        produced: 0,
      };
      return;
    }

    const surface = bakeRegion(sprites.slice().sort(compareSprite), atlases, worldW, worldH, decorate, reg, false);
    const { gl } = this.ctx;
    this.texture = uploadImageTexture(gl, surface, reg.width, reg.height, gl.CLAMP_TO_EDGE, "static-layer bake");
    this.textureW = reg.width;
    this.textureH = reg.height;
    this.regionOriginX = reg.originX;
    this.regionOriginY = reg.originY;
  }

  /**
   * Show a painted image, already cut into patches by the asset step, as the layer. Its patches
   * upload as the view reaches them and are freed like baked ones. The image's top-left sits at
   * world (0, 0).
   */
  bakeImage(image: PatchedImage): void {
    this.clear();
    this.initProgram();
    const { manifest } = image;
    if (manifest.patchSize > this.limit()) {
      throw new RangeError(
        `static-layer image patches are ${manifest.patchSize}px but this device allows ${this.limit()}px. ` +
          `Cut the image at a smaller patch size.`,
      );
    }
    this.patched = {
      grid: patchGrid({ originX: 0, originY: 0, width: manifest.width, height: manifest.height }, manifest.patchSize),
      source: image,
      live: new Map(),
      produced: 0,
    };
  }

  /** How many textures the layer holds now (1, the live patch count, or 0). */
  get textureCount(): number {
    if (this.patched) return this.patched.live.size;
    return this.texture ? 1 : 0;
  }

  info(): StaticLayerInfo {
    const p = this.patched;
    if (p) {
      let largest = 0;
      for (const lp of p.live.values()) largest = Math.max(largest, lp.rect.width, lp.rect.height);
      return {
        mode: "patched",
        patchSize: p.grid.size,
        cols: p.grid.cols,
        rows: p.grid.rows,
        live: p.live.size,
        largest,
        produced: p.produced,
      };
    }
    if (this.texture) {
      return {
        mode: "single",
        patchSize: 0,
        cols: 0,
        rows: 0,
        live: 1,
        largest: Math.max(this.textureW, this.textureH),
        produced: 1,
      };
    }
    return { mode: "none", patchSize: 0, cols: 0, rows: 0, live: 0, largest: 0, produced: 0 };
  }

  clear(): void {
    const { gl } = this.ctx;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.patched) {
      for (const [key, lp] of this.patched.live) {
        gl.deleteTexture(lp.texture);
        this.patched.source.release?.(key);
      }
    }
    this.patched = null;
    this.texture = null;
    this.textureW = 0;
    this.textureH = 0;
    this.regionOriginX = 0;
    this.regionOriginY = 0;
  }

  draw(target: GlContext, _view: ViewUniform, visRect: VisibleRect): void {
    if (this.patched) {
      this.drawPatches(target, visRect, this.patched);
      return;
    }
    if (!this.texture || !this.program || !this.uniforms) return;
    if (target.isLost()) return;
    const { visL, visT, visR, visB } = visRect;
    // Clamp the visible rect to the baked region (handles a windowed bake; a
    // whole-world bake leaves src == dst == the visible rect, byte-identical).
    const blit = staticBlitRect(visL, visT, visR, visB, {
      originX: this.regionOriginX,
      originY: this.regionOriginY,
      width: this.textureW,
      height: this.textureH,
    });
    if (!blit) return;

    const srcU0 = blit.srcX / this.textureW;
    const srcV0 = blit.srcY / this.textureH;
    const srcU1 = (blit.srcX + blit.srcW) / this.textureW;
    const srcV1 = (blit.srcY + blit.srcH) / this.textureH;
    const dstL = blit.dstL;
    const dstT = blit.dstT;
    const dstR = blit.dstL + blit.dstW;
    const dstB = blit.dstT + blit.dstH;

    const gl = target.gl;
    gl.useProgram(this.program);
    gl.uniform4f(this.uniforms.u_view, this.viewScaleX, this.viewScaleY, this.viewOffsetX, this.viewOffsetY);
    gl.uniform4f(this.uniforms.u_srcRect, srcU0, srcV0, srcU1, srcV1);
    gl.uniform4f(this.uniforms.u_dstRect, dstL, dstT, dstR, dstB);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.uniforms.u_tex) gl.uniform1i(this.uniforms.u_tex, 0);

    // Premultiplied-alpha blend, matching the WGSL original's pipeline blend state
    // ({srcFactor:"one", dstFactor:"one-minus-src-alpha"} on both color and alpha). No depth test —
    // this context is created with depth:false on purpose (sprite order is CPU-sorted).
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Make one patch live: produce its image and upload it. False while its source is loading. */
  private makeLive(p: Patched, key: number): boolean {
    const rect = patchRect(p.grid, key);
    const image = p.source.produce(key, rect);
    if (!image) return false;
    const { gl } = this.ctx;
    const texture = uploadImageTexture(gl, image, rect.width, rect.height, gl.CLAMP_TO_EDGE, `static-layer patch ${key}`);
    p.live.set(key, { texture, rect });
    p.produced += 1;
    return true;
  }

  /**
   * Patched draw: free far patches, make the visible ones live (all of them, this frame), bake
   * ahead in the ring within the per-frame budget, then one blit per visible patch.
   */
  private drawPatches(target: GlContext, visRect: VisibleRect, p: Patched): void {
    if (!this.program || !this.uniforms) return;
    if (target.isLost()) return;
    const range = visiblePatchRange(p.grid, visRect);
    const plan = planPatches(p.grid, range, new Set(p.live.keys()));
    const gl = target.gl;
    for (const key of plan.evict) {
      const lp = p.live.get(key);
      if (!lp) continue;
      gl.deleteTexture(lp.texture);
      p.live.delete(key);
      p.source.release?.(key);
    }
    for (const key of plan.visible) if (!p.live.has(key)) this.makeLive(p, key);
    let budget = RING_BAKES_PER_FRAME;
    for (const key of plan.ahead) {
      if (budget <= 0) break;
      if (this.makeLive(p, key)) budget -= 1;
    }

    const { visL, visT, visR, visB } = visRect;
    gl.useProgram(this.program);
    gl.uniform4f(this.uniforms.u_view, this.viewScaleX, this.viewScaleY, this.viewOffsetX, this.viewOffsetY);
    gl.activeTexture(gl.TEXTURE0);
    if (this.uniforms.u_tex) gl.uniform1i(this.uniforms.u_tex, 0);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const key of plan.visible) {
      const lp = p.live.get(key);
      if (!lp) continue; // still loading
      const r = lp.rect;
      const blit = staticBlitRect(visL, visT, visR, visB, r);
      if (!blit) continue;
      gl.uniform4f(
        this.uniforms.u_srcRect,
        blit.srcX / r.width,
        blit.srcY / r.height,
        (blit.srcX + blit.srcW) / r.width,
        (blit.srcY + blit.srcH) / r.height,
      );
      gl.uniform4f(this.uniforms.u_dstRect, blit.dstL, blit.dstT, blit.dstL + blit.dstW, blit.dstT + blit.dstH);
      gl.bindTexture(gl.TEXTURE_2D, lp.texture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
}

/**
 * Bake the world rect `rect` onto a canvas of its size: the sprites that touch it in sort order,
 * then the decorator. Both draw in world coords; the context is translated so `rect`'s corner
 * lands at (0, 0). Neighbouring rects get identical pixels along their shared edge, because each
 * draws the same sprites with the same world-to-pixel mapping.
 *
 * `cull` false draws every sprite (the single-texture bake, whose rect holds them all anyway).
 */
function bakeRegion(
  sorted: readonly Sprite[],
  atlases: Map<string, LoadedAtlasImage>,
  worldW: number,
  worldH: number,
  decorate: DecorateFn | undefined,
  rect: StaticRegion,
  cull = true,
): OffscreenCanvas | HTMLCanvasElement {
  const surface = createOffscreen(rect.width, rect.height);
  const bakeCtx = surface.getContext("2d") as Ctx2D | null;
  if (!bakeCtx) throw new Error("StaticLayerPass: failed to acquire an offscreen 2d context");
  bakeCtx.imageSmoothingEnabled = false;
  bakeCtx.clearRect(0, 0, rect.width, rect.height);
  const offset = rect.originX !== 0 || rect.originY !== 0;
  if (offset) bakeCtx.translate(-rect.originX, -rect.originY);
  for (const s of cull ? spritesInRect(sorted, rect) : sorted) drawSprite(bakeCtx, atlases, s);
  if (decorate) decorate(bakeCtx, worldW, worldH, rect);
  if (offset) bakeCtx.translate(rect.originX, rect.originY);
  return surface;
}
