// static-layer-pass.ts — WebGL2 sibling of ../webgpu/static-layer-pass.ts's `StaticLayerPass`
// (and the `assertTextureWithinLimits`/`VisibleRect` exports that file also carries).
//
// The CPU bake (createOffscreen + drawSprite, sorted + decorated onto an offscreen 2D canvas) is
// UNCHANGED — it was already backend-neutral (see ../raster2d.ts). Only the upload (device.createTexture
// + copyExternalImageToTexture → gl.createTexture + gl.texImage2D) and the visible-sub-rect blit
// (a WebGPU render pass draw(4) → an attributeless gl.drawArrays(TRIANGLE_STRIP, 0, 4)) become GL.
//
// See ./shaders/static-layer.{vert,frag}.glsl for the shader half of this port.

import type { GlContext } from "./gl-context";
import { compileProgram, uniformLocations } from "./program";
import type { DecorateFn, Sprite } from "../renderer";
import type { LoadedAtlasImage } from "../../assets/loader";
import { createOffscreen, compareSprite, drawSprite } from "../raster2d";
import type { Ctx2D } from "../sprite-types";
import { resolveStaticRegion, staticBlitRect } from "../static-region";
import type { StaticRegion } from "../static-region";
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
        `Reduce the world size, or window the bake so it allocates a viewport-sized sub-region instead.`,
    );
  }
}

/**
 * Upload a canvas-shaped image source as an RGBA8 texture, nearest-filtered, with the given wrap
 * mode. `UNPACK_FLIP_Y_WEBGL` is set true for the duration of this one upload and restored to false
 * immediately after — WebGL's canvas/image upload convention stores row 0 (the top of the source)
 * at texture V=1 unless flipped, but every vertex shader in this port maps V=0 to the world-top edge
 * (the same convention the WGSL original used against WebGPU's top-origin sampling). Flipping here,
 * once, keeps that vertex math unchanged. Restoring the pixelStorei flag afterward matters because
 * it is context-global state — leaving it set would silently flip every OTHER pass's texture upload
 * this frame.
 */
function uploadImageTexture(
  gl: WebGL2RenderingContext,
  source: OffscreenCanvas | HTMLCanvasElement,
  width: number,
  height: number,
  wrap: number,
  label: string,
): WebGLTexture {
  assertTextureWithinLimits(gl, width, height, label);
  const tex = gl.createTexture();
  if (!tex) throw new Error(`webgl2: gl.createTexture() returned null for "${label}"`);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

const VIEW_UNIFORM_NAMES = ["u_view", "u_srcRect", "u_dstRect", "u_tex"] as const;

export class StaticLayerPass {
  private readonly ctx: GlContext;

  private program: WebGLProgram | null = null;
  private uniforms: Record<(typeof VIEW_UNIFORM_NAMES)[number], WebGLUniformLocation | null> | null =
    null;

  private texture: WebGLTexture | null = null;
  private textureW = 0;
  private textureH = 0;
  // World-px origin the baked texture covers (0,0 for a whole-world bake).
  private regionOriginX = 0;
  private regionOriginY = 0;

  // The shared view uniform, set once per frame via `setView` (see the doc comment on that method
  // for why this indirection exists instead of reading the `_view` param `draw` receives).
  private viewScaleX = 0;
  private viewScaleY = 0;
  private viewOffsetX = 0;
  private viewOffsetY = 0;

  constructor(ctx: GlContext) {
    this.ctx = ctx;
  }

  private initProgram(): void {
    if (this.program) return;
    const { gl } = this.ctx;
    this.program = compileProgram(gl, staticVert, staticFrag, "static-layer");
    this.uniforms = uniformLocations(gl, this.program, VIEW_UNIFORM_NAMES);
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

  bake(
    sprites: readonly Sprite[],
    atlases: Map<string, LoadedAtlasImage>,
    worldWidth: number,
    worldHeight: number,
    decorate?: DecorateFn,
    region?: StaticRegion,
  ): void {
    const reg = resolveStaticRegion(worldWidth, worldHeight, region);
    const w = reg.width;
    const h = reg.height;
    const surface = createOffscreen(w, h);
    const bakeCtx = surface.getContext("2d") as Ctx2D | null;
    if (!bakeCtx) throw new Error("StaticLayerPass.bake: failed to acquire offscreen 2d context");
    bakeCtx.imageSmoothingEnabled = false;
    bakeCtx.clearRect(0, 0, w, h);
    // Sprites + decorate draw in WORLD coords; translate by -origin onto the
    // windowed texture (no-op for a whole-world bake → byte-identical).
    const offset = reg.originX !== 0 || reg.originY !== 0;
    if (offset) bakeCtx.translate(-reg.originX, -reg.originY);
    const sorted = sprites.slice().sort(compareSprite);
    for (const s of sorted) {
      drawSprite(bakeCtx, atlases, s);
    }
    if (decorate) decorate(bakeCtx, w, h);
    if (offset) bakeCtx.translate(reg.originX, reg.originY);

    this.initProgram();
    const { gl } = this.ctx;
    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = uploadImageTexture(gl, surface, w, h, gl.CLAMP_TO_EDGE, "static-layer bake");
    this.textureW = w;
    this.textureH = h;
    this.regionOriginX = reg.originX;
    this.regionOriginY = reg.originY;
  }

  clear(): void {
    if (this.texture) {
      this.ctx.gl.deleteTexture(this.texture);
    }
    this.texture = null;
    this.textureW = 0;
    this.textureH = 0;
    this.regionOriginX = 0;
    this.regionOriginY = 0;
  }

  draw(target: GlContext, _view: ViewUniform, visRect: VisibleRect): void {
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
}
