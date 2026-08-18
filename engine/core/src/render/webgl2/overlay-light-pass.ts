// overlay-light-pass.ts — additive screen-space light pass (brief 05).
//
// Restores Farm's night-glow `OverlayFn` (see games/farm/client/src/render/lights.ts's
// `makeLightOverlay`): warm radial glows drawn with
// `globalCompositeOperation = "lighter"`. The WebGPU backend accepted this callback as
// `endFrame`'s 4th parameter but never invoked it (`_overlay`), so those glows have
// never actually rendered while Farm has been WebGPU-forced — this is a live bug fix,
// not a new feature.
//
// THE NAIVE FIX IS WRONG. Running the callback straight onto the screen-space
// `Overlay2D` `Ctx2D` (the transparent canvas layered over the GPU canvas) would look
// plausible but isn't additive: the overlay canvas itself gets alpha-composited onto
// the world by the BROWSER's own compositor, so a `"lighter"` glow drawn inside it
// degrades into a translucent haze rather than light genuinely ADDED to the scene.
//
// Correct approach — the CPU-bake -> GPU-sample idiom `../webgpu/static-layer-pass.ts`
// already uses for baked world art:
//   1. Run the `OverlayFn` into an offscreen 2D canvas, sized to the GL drawing
//      buffer, cleared every frame, with the SAME world transform
//      `Overlay2D.applyWorldTransform` would apply — the callback authors in world
//      pixels and expects that transform (see `OverlayLightView`, mirroring the
//      screen-pixel `ViewUniform` variant, NOT the GPU clip-space one).
//   2. Upload that canvas as a texture and additively blend
//      (`gl.blendFunc(gl.ONE, gl.ONE)`) one full-screen quad, inside the world pass,
//      ordered AFTER sprites and BEFORE the day/night wash (`TintPass`) — see this
//      class's `draw` doc for the exact reasoning, and the brief-05 handoff notes for
//      where a future renderer assembly (brief 08) must call this.
//   3. Skip everything — no offscreen bake, no texture upload, no draw call — when no
//      `OverlayFn` is supplied, so Citadel and MateQuest (which pass none) pay zero
//      cost.
import { compileProgram, uniformLocations, createVao } from "./program";
import { createOffscreen } from "../raster2d";
import type { Ctx2D } from "../sprite-types";
import type { OverlayFn } from "../renderer";
import vertSrc from "./shaders/overlay-light.vert.glsl?raw";
import fragSrc from "./shaders/overlay-light.frag.glsl?raw";

/**
 * The screen-pixel view an `OverlayFn` expects, mirroring `Overlay2D.applyWorldTransform`'s
 * `ViewUniform` variant: positive scale, device-pixel offsets. NOT the GPU clip-space
 * view (whose scaleY is negative) — see `view-uniform.ts`'s header comment on the two
 * non-interchangeable variants.
 */
export interface OverlayLightView {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

const UNIFORM_NAMES = ["u_tex"] as const;

export class OverlayLightPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;
  private readonly vao: WebGLVertexArrayObject;
  private readonly texture: WebGLTexture;

  // Bake target, lazily (re)created to match the GL drawing buffer's current size.
  private bakeCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private bakeCtx: Ctx2D | null = null;
  private bakeW = 0;
  private bakeH = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = compileProgram(gl, vertSrc, fragSrc, "overlay-light");
    this.uniforms = uniformLocations(gl, this.program, UNIFORM_NAMES);
    this.vao = createVao(gl, () => {});

    const tex = gl.createTexture();
    if (!tex) throw new Error("webgl2: gl.createTexture() returned null (OverlayLightPass)");
    this.texture = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // Pixel-art overlay content (radial gradients are already smooth; nearest just
    // avoids introducing any extra blur at the 1:1 sample this full-screen quad does).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Bakes `overlay` into an offscreen 2D canvas and additively blends the result as
   * one full-screen quad. A complete no-op — no offscreen canvas touched, no GL call
   * issued — when `overlay` is `undefined`, so callers that never pass an `OverlayFn`
   * (Citadel, MateQuest) pay nothing.
   *
   * `drawingBufferWidth`/`drawingBufferHeight` size the bake to the GL backing store,
   * in device pixels — the same size the fragment shader samples 1:1 (no scaling).
   * `view` is the screen-pixel transform `OverlayFn` expects (see `OverlayLightView`);
   * this method applies it exactly as `Overlay2D.applyWorldTransform` would before
   * invoking the callback, so `glow.cx`/`glow.cy`-style world-pixel coordinates land
   * in the right place. Matches Canvas2D's `endFrame` overlay behaviour (see
   * `canvas2d/renderer.ts`), which remains the visual reference for this pass.
   *
   * CALL ORDER (renderer assembly, brief 08): this pass draws additively INTO the
   * world pass, AFTER the sprite/shadow/particle/weather/cloud draws and BEFORE
   * `TintPass.draw` (the day/night wash). That order means the wash's translucent
   * colour composites over the lit scene same as everything else, so a bright night
   * gate glow still reads as "glowing at night" rather than being fully exempted from
   * the wash — see the brief-05 handoff notes for the full reasoning and the
   * alternative (Canvas2D draws its overlay AFTER the wash) this deliberately departs
   * from.
   *
   * Blend state: sets `gl.blendFunc(gl.ONE, gl.ONE)` (additive) itself and leaves
   * `gl.BLEND` enabled — `TintPass.draw`, called immediately after by the caller, sets
   * its own blend function before drawing, so no explicit restore is needed here.
   */
  draw(
    overlay: OverlayFn | undefined,
    view: OverlayLightView,
    drawingBufferWidth: number,
    drawingBufferHeight: number,
  ): void {
    if (overlay === undefined) return;
    if (drawingBufferWidth <= 0 || drawingBufferHeight <= 0) return;

    const gl = this.gl;

    if (
      this.bakeCanvas === null ||
      this.bakeW !== drawingBufferWidth ||
      this.bakeH !== drawingBufferHeight
    ) {
      this.bakeCanvas = createOffscreen(drawingBufferWidth, drawingBufferHeight);
      const ctx = this.bakeCanvas.getContext("2d") as Ctx2D | null;
      if (!ctx) throw new Error("webgl2: OverlayLightPass offscreen 2d context unavailable");
      this.bakeCtx = ctx;
      this.bakeW = drawingBufferWidth;
      this.bakeH = drawingBufferHeight;
    }

    const ctx = this.bakeCtx!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, drawingBufferWidth, drawingBufferHeight);
    ctx.imageSmoothingEnabled = false;
    // The world transform the callback expects — mirrors Overlay2D.applyWorldTransform.
    ctx.setTransform(view.sx, 0, 0, view.sy, view.ox, view.oy);
    overlay(ctx, view);
    // Restore identity + default composite/alpha so a callback that left "lighter" or
    // a reduced globalAlpha set doesn't leak into next frame's clearRect/setTransform.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // Upload premultiplied: the canvas already stores its pixels premultiplied
    // internally, so requesting the premultiplied form avoids an
    // unpremultiply-then-remultiply round trip AND means `texture.rgb` in the
    // fragment shader is already `color * alpha` — exactly the value
    // `gl.blendFunc(ONE, ONE)` (additive) should be summing onto the scene.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
      this.bakeCanvas as TexImageSource,
    );

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.u_tex, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
