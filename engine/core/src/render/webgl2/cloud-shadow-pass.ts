// cloud-shadow-pass.ts — WebGL2 port of ../webgpu/cloud-shadow-pass.ts
// (`CloudShadowPass`, shaders/cloud.wgsl). Read shaders/cloud.vert.glsl +
// shaders/cloud.frag.glsl's header comments first — they carry the full fBm /
// quantization / two-polarity / vignette design writeup ported from the WGSL
// original almost line-for-line.
//
// A single fullscreen-triangle pass, no vertex buffer (gl_VertexID-driven,
// same trick as sprite.vert.glsl/shadow.vert.glsl). `CloudOptions` is the
// canonical type declared in ../renderer.ts — imported read-only here, never
// redeclared.
//
// View-uniform handling follows shadow-batch.ts's convention exactly: this
// pass only needs the 4 clip-space scale/offset fields (not the full
// `ViewUniform` — cloud animation phase comes from `CloudOptions.timeSec`,
// not the view's `timeSec`), set once per frame via `setView` — the GL
// analogue of the WebGPU orchestrator's `pass.setBindGroup(0, viewBindGroup)`
// — rather than threaded through every `draw()` call.
//
// ── The contract this pass does NOT enforce itself (documented for brief 08,
//    which assembles WebGl2Renderer and owns wiring this pass in) ──────────
// In the WebGPU renderer (webgpu/renderer.ts ~530-534) the skip-when-clear
// and consume-each-frame behaviour live in the RENDERER, not the pass:
//   if (this._cloudOpts !== undefined && this._cloudOpts.coverage > 0.001) {
//     this._cloudPass.draw(pass, this._cloudOpts);
//   }
//   this._cloudOpts = undefined;  // consumed regardless of whether it drew
// `draw()` below defends against being called with a near-zero coverage
// (see the early return) so calling it is always safe, but the actual
// "coverage <= 0.001 skips the draw" gate AND the "stored options are reset
// to undefined after use, so callers must re-set per frame" contract belong
// in WebGl2Renderer's `setCloudOptions`/`endFrame`, exactly mirroring the
// WebGPU renderer's shape. Preserve both when wiring this in.
import vertSrc from "./shaders/cloud.vert.glsl?raw";
import fragSrc from "./shaders/cloud.frag.glsl?raw";
import { compileProgram, uniformLocations, createVao } from "./program";
import { rgbOf } from "../palette";
import type { CloudOptions } from "../renderer";
import type { ViewUniform } from "../view-uniform";

const UNIFORM_NAMES = [
  "u_scale",
  "u_offset",
  "u_color",
  "u_coverage",
  "u_drift_speed",
  "u_time_sec",
  "u_mode",
  "u_vignette",
] as const;

/** Coverage at or below this threshold is treated as "off" — see the file
 *  header comment for why the renderer, not this pass, is the primary
 *  enforcer of the skip; this is a cheap defensive mirror of that same gate. */
const COVERAGE_EPSILON = 0.001;

export class CloudShadowPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;
  private readonly vao: WebGLVertexArrayObject;

  private lastView: Pick<ViewUniform, "scaleX" | "scaleY" | "offsetX" | "offsetY"> = {
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  };

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = compileProgram(gl, vertSrc, fragSrc, "cloud");
    this.uniforms = uniformLocations(gl, this.program, UNIFORM_NAMES);
    // Fullscreen triangle needs no vertex attributes (gl_VertexID-driven) —
    // the VAO exists only so draw() never depends on whatever VAO a prior
    // pass left bound, same defensive reasoning as ShadowBatch's empty VAO.
    this.vao = createVao(gl, () => {});
  }

  /** Must be called once per frame, before `draw` — the GL analogue of the
   *  WebGPU orchestrator's `pass.setBindGroup(0, viewBindGroup)`. Only the 4
   *  clip-space scale/offset fields are read; `scaleY` is ALREADY NEGATIVE
   *  per the shared `ViewUniform` clip-space convention — do not negate
   *  again before calling this. */
  setView(view: Pick<ViewUniform, "scaleX" | "scaleY" | "offsetX" | "offsetY">): void {
    this.lastView = view;
  }

  /**
   * Draw the cloud-shadow/haze/vignette overlay to whichever framebuffer is
   * currently bound on `gl` (the "target" — this pass never binds a
   * framebuffer itself, matching ShadowBatch.draw(gl)/SpriteBatch's shape:
   * the renderer decides what's bound before calling any pass).
   *
   * Draw order (per the brief): after particles/weather, before the
   * day/night wash (`TintPass`, a separate pass drawn on top of this one).
   *
   * Defensive skip: coverage <= 0.001 is a no-op here too (belt-and-suspenders
   * with the renderer's own gate — see the file header comment). This does
   * NOT implement the "reset stored options after use" half of the contract;
   * that is state the renderer owns, not this pass.
   */
  draw(gl: WebGL2RenderingContext, opts: CloudOptions): void {
    if (opts.coverage <= COVERAGE_EPSILON) return;

    const [r255, g255, b255] = rgbOf(opts.color);
    const r = (r255 ?? 0) / 255;
    const g = (g255 ?? 0) / 255;
    const b = (b255 ?? 0) / 255;

    gl.useProgram(this.program);

    const view = this.lastView;
    gl.uniform2f(this.uniforms.u_scale, view.scaleX, view.scaleY);
    gl.uniform2f(this.uniforms.u_offset, view.offsetX, view.offsetY);
    gl.uniform3f(this.uniforms.u_color, r, g, b);
    gl.uniform1f(this.uniforms.u_coverage, opts.coverage);
    gl.uniform1f(this.uniforms.u_drift_speed, opts.driftSpeed);
    gl.uniform1f(this.uniforms.u_time_sec, opts.timeSec);
    // mode: 0 = shadow (darken), 1 = haze (warm lift). Packed as a float flag,
    // matching the WGSL original's `cloud_u.mode` packing.
    gl.uniform1f(this.uniforms.u_mode, opts.mode === "haze" ? 1 : 0);
    gl.uniform1f(this.uniforms.u_vignette, Math.max(0, Math.min(1, opts.vignette ?? 0)));

    // Premultiplied source-over, translated literally from the WebGPU
    // pipeline's blend descriptor (srcFactor=one, dstFactor=one-minus-src-alpha,
    // op=add on both channels) — same rationale as shadow-batch.ts's draw().
    gl.enable(gl.BLEND);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}
