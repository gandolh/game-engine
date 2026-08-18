// water-pass.ts — WebGL2 sibling of ../webgpu/static-layer-pass.ts's `WaterPass`.
//
// Animated water: a scrolling pattern fill (bakePattern) plus a procedural swell/ripple/glint
// fragment pass, with a depth mask and a `zoomedOut` (sx < 1) branch threaded through — all of it
// ported behaviour-for-behaviour from ../webgpu/shaders/water.wgsl. See that file's header comment
// for the full task history of what got added/removed from the shader; this is a backend port, not
// a redesign, so dormant plumbing (see ./shaders/water.frag.glsl's header) is preserved as dormant.
//
// `assertTextureWithinLimits` lives in ./static-layer-pass.ts — imported here, not duplicated.

import type { GlContext } from "./gl-context";
import { compileProgram, uniformLocations } from "./program";
import type { LoadedAtlasImage } from "../../assets/loader";
import { createOffscreen } from "../raster2d";
import type { Ctx2D } from "../sprite-types";
import { EDG } from "../palette";
import type { ViewUniform } from "../view-uniform";
import { assertTextureWithinLimits } from "./static-layer-pass";
import type { VisibleRect } from "./static-layer-pass";
import waterVert from "./shaders/water.vert.glsl?raw";
import waterFrag from "./shaders/water.frag.glsl?raw";

export type { VisibleRect };

function hexToRgb(hex: string): [number, number, number] {
  let c = hex.trim();
  if (c.startsWith("#")) c = c.slice(1);
  if (c.length === 3) c = c[0]! + c[0]! + c[1]! + c[1]! + c[2]! + c[2]!;
  const n = parseInt(c, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

const WATER_DEEP = hexToRgb(EDG.blue);
const WATER_SHALLOW = hexToRgb(EDG.skyBlue);
const WATER_GLINT = hexToRgb(EDG.cyan);
const WATER_FOAM = hexToRgb(EDG.white);
const WATER_CAUSTICS = hexToRgb(EDG.cyan);

/**
 * Upload a canvas-shaped image source as an RGBA8 texture with the given wrap mode, nearest
 * filtered. See ./static-layer-pass.ts's `uploadImageTexture` for why `UNPACK_FLIP_Y_WEBGL` is
 * toggled just for this call and restored immediately after (context-global state; must not leak
 * into another pass's upload this frame). Duplicated here (not imported) because that helper is not
 * exported — two small near-identical upload paths in sibling files is cheaper than widening
 * ./static-layer-pass.ts's public surface for a private helper.
 */
function uploadPatternTexture(
  gl: WebGL2RenderingContext,
  source: OffscreenCanvas | HTMLCanvasElement,
  size: number,
): WebGLTexture {
  assertTextureWithinLimits(gl, size, size, "water pattern bake");
  const tex = gl.createTexture();
  if (!tex) throw new Error('webgl2: gl.createTexture() returned null for "water pattern bake"');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // The scrolling pattern is the one texture in this port that needs REPEAT — WebGL2 allows REPEAT
  // on NPOT textures (unlike WebGL1), and the baked size here comes from atlas frame dims, which are
  // not guaranteed power-of-two. Every other texture in this port is CLAMP_TO_EDGE.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/**
 * Upload the depth mask as a single-channel R8 texture. Raw `Uint8Array` upload (not a canvas), so
 * `UNPACK_FLIP_Y_WEBGL` is left false (row order here is caller-defined tilesX×tilesY, not an image
 * convention, and this texture is currently unsampled by the shader — see the frag shader header).
 * `UNPACK_ALIGNMENT` is set to 1 for the duration of the call: the default of 4 would misinterpret
 * the row stride for any `tilesX` not a multiple of 4, corrupting the mask.
 */
function uploadDepthTexture(
  gl: WebGL2RenderingContext,
  data: Uint8Array,
  w: number,
  h: number,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('webgl2: gl.createTexture() returned null for "water depth mask"');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  // Linear + clamp-to-edge, matching the WGSL original's samplerDepth (open ocean → 0 at the edge,
  // no wrap-around into the opposite shore).
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

const WATER_UNIFORM_NAMES = [
  "u_view",
  "u_rect",
  "u_time",
  "u_swellAlpha",
  "u_deepColor",
  "u_shallowColor",
  "u_glintColor",
  "u_scroll",
  "u_tileSize",
  "u_useLinear",
  "u_foamColor",
  "u_causticsColor",
  "u_depthParams",
  "u_waterTex",
  "u_depthMask",
] as const;

export class WaterPass {
  private readonly ctx: GlContext;

  private program: WebGLProgram | null = null;
  private uniforms: Record<(typeof WATER_UNIFORM_NAMES)[number], WebGLUniformLocation | null> | null =
    null;

  private waterTexture: WebGLTexture | null = null;
  private tileSize = 0;
  private scrollX = 0;
  private scrollY = 0;
  private swellAlpha = 0;
  private swellScrollX = 0;
  private swellScrollY = 0;

  private depthTexture: WebGLTexture | null = null;
  private worldWidthPx = 0;
  private worldHeightPx = 0;
  private tilePx = 0;

  // See StaticLayerPass.setView's doc comment — same rationale: WebGL2 has no bind-group
  // equivalent to share a view uniform for free, so `draw`'s `_view` param stays unused and this
  // method is the explicit per-frame stand-in.
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
    this.program = compileProgram(gl, waterVert, waterFrag, "water");
    this.uniforms = uniformLocations(gl, this.program, WATER_UNIFORM_NAMES);
  }

  /** See StaticLayerPass.setView. Until called, `draw` uses an all-zero default (nothing visible). */
  setView(view: ViewUniform): void {
    this.viewScaleX = view.scaleX;
    this.viewScaleY = view.scaleY;
    this.viewOffsetX = view.offsetX;
    this.viewOffsetY = view.offsetY;
  }

  bakePattern(
    atlases: Map<string, LoadedAtlasImage>,
    frame: string,
    atlasId: string,
    tileSize: number,
    pixelScale = 1,
  ): void {
    const atlas = atlases.get(atlasId);
    if (!atlas) throw new Error(`WaterPass.bakePattern: atlas "${atlasId}" not found`);
    const scale = Math.max(1, Math.round(pixelScale));
    const size = Math.max(1, Math.ceil(tileSize) * scale);

    const surface = createOffscreen(size, size);
    const tctx = surface.getContext("2d") as Ctx2D | null;
    if (!tctx) throw new Error("WaterPass.bakePattern: failed to acquire offscreen 2d context");
    tctx.imageSmoothingEnabled = false;
    const r = atlas.frameRect(frame);
    tctx.drawImage(atlas.bitmap, r.x, r.y, r.w, r.h, 0, 0, size, size);

    this.initProgram();
    const { gl } = this.ctx;
    if (this.waterTexture) gl.deleteTexture(this.waterTexture);
    this.waterTexture = uploadPatternTexture(gl, surface, size);
    this.tileSize = size;
    this.scrollX = 0;
    this.scrollY = 0;
  }

  setDepthMask(
    data: Uint8Array,
    tilesX: number,
    tilesY: number,
    worldWidthPx: number,
    worldHeightPx: number,
    tilePxSize: number,
  ): void {
    const w = Math.max(1, tilesX);
    const h = Math.max(1, tilesY);
    if (data.length < w * h) {
      throw new Error(`WaterPass.setDepthMask: data too small (got ${data.length}, need ${w * h})`);
    }

    this.initProgram();
    const { gl } = this.ctx;
    if (this.depthTexture) gl.deleteTexture(this.depthTexture);
    this.depthTexture = uploadDepthTexture(gl, data, w, h);
    this.worldWidthPx = worldWidthPx;
    this.worldHeightPx = worldHeightPx;
    this.tilePx = tilePxSize;
  }

  setScroll(offsetX: number, offsetY: number): void {
    if (this.tileSize <= 0) return;
    this.scrollX = offsetX % this.tileSize;
    this.scrollY = offsetY % this.tileSize;
  }

  setSwell(alpha: number, offsetX: number, offsetY: number): void {
    this.swellAlpha = alpha;
    if (this.tileSize > 0) {
      this.swellScrollX = offsetX % this.tileSize;
      this.swellScrollY = offsetY % this.tileSize;
    }
  }

  draw(target: GlContext, _view: ViewUniform, visRect: VisibleRect, zoomedOut: boolean): void {
    if (!this.waterTexture || !this.program || !this.uniforms) return;
    if (target.isLost()) return;
    const { visL, visT, visR, visB } = visRect;
    const visW = visR - visL;
    const visH = visB - visT;
    if (visW <= 0 || visH <= 0) return;

    const timeSec = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;

    const gl = target.gl;
    gl.useProgram(this.program);

    const u = this.uniforms;
    gl.uniform4f(u.u_view, this.viewScaleX, this.viewScaleY, this.viewOffsetX, this.viewOffsetY);
    gl.uniform4f(u.u_rect, visL, visT, visR, visB);
    gl.uniform1f(u.u_time, timeSec);
    gl.uniform1f(u.u_swellAlpha, this.swellAlpha);
    gl.uniform4f(u.u_deepColor, WATER_DEEP[0]!, WATER_DEEP[1]!, WATER_DEEP[2]!, 1.0);
    gl.uniform4f(u.u_shallowColor, WATER_SHALLOW[0]!, WATER_SHALLOW[1]!, WATER_SHALLOW[2]!, 1.0);
    gl.uniform4f(u.u_glintColor, WATER_GLINT[0]!, WATER_GLINT[1]!, WATER_GLINT[2]!, 1.0);

    // Dormant plumbing (see ./shaders/water.frag.glsl's header) — set for parity even though the
    // shader doesn't read these today. `zoomedOut` lands here as `u_useLinear`, matching the WGSL
    // original's `data[10] = zoomedOut ? 1.0 : 0.0`.
    if (u.u_scroll) gl.uniform4f(u.u_scroll, this.scrollX, this.scrollY, this.swellScrollX, this.swellScrollY);
    if (u.u_tileSize) gl.uniform1f(u.u_tileSize, this.tileSize);
    if (u.u_useLinear) gl.uniform1f(u.u_useLinear, zoomedOut ? 1.0 : 0.0);
    if (u.u_foamColor) gl.uniform4f(u.u_foamColor, WATER_FOAM[0]!, WATER_FOAM[1]!, WATER_FOAM[2]!, 1.0);
    if (u.u_causticsColor)
      gl.uniform4f(u.u_causticsColor, WATER_CAUSTICS[0]!, WATER_CAUSTICS[1]!, WATER_CAUSTICS[2]!, 1.0);
    if (u.u_depthParams) {
      gl.uniform4f(
        u.u_depthParams,
        this.worldWidthPx > 0 ? this.worldWidthPx : 1.0,
        this.worldHeightPx > 0 ? this.worldHeightPx : 1.0,
        this.tilePx > 0 ? this.tilePx : 1.0,
        0.0,
      );
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.waterTexture);
    if (u.u_waterTex) gl.uniform1i(u.u_waterTex, 0);

    if (this.depthTexture && u.u_depthMask) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
      gl.uniform1i(u.u_depthMask, 1);
    }

    // Premultiplied-alpha blend, matching the WGSL original's pipeline blend state. No depth test —
    // this context is created with depth:false on purpose; the "depth mask" here is a texture/
    // uniform (shore-proximity data), unrelated to a GL depth buffer.
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
