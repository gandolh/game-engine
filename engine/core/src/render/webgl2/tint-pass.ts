// tint-pass.ts — WebGL2 port of ../webgpu/tint-pass.ts.
//
// A full-screen quad drawn last in the world pass, compositing a solid EDG colour wash
// over the scene at a caller-supplied alpha (the day/night wash). No vertex buffer is
// needed — both shaders derive the 3 corners of a full-screen triangle from
// `gl_VertexID` (see shaders/tint.vert.glsl), the same trick the WGSL original used via
// `@builtin(vertex_index)`.
import vertSrc from "./shaders/tint.vert.glsl?raw";
import fragSrc from "./shaders/tint.frag.glsl?raw";
import { compileProgram, uniformLocations, createVao } from "./program";
import { rgbOf } from "../palette";

const UNIFORM_NAMES = ["u_color", "u_alpha"] as const;

export class TintPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;
  private readonly vao: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    // Compiled once here, not per draw() — mirrors the WGSL original hoisting its
    // pipeline/bind-group out of the hot path (see webgpu/tint-pass.test.ts).
    this.program = compileProgram(gl, vertSrc, fragSrc, "tint");
    this.uniforms = uniformLocations(gl, this.program, UNIFORM_NAMES);
    // No attributes to configure — the fullscreen triangle needs no vertex buffer —
    // but WebGL2 still wants *a* VAO bound while drawing, so create an empty one
    // via the shared helper rather than reinventing the create/bind/unbind dance.
    this.vao = createVao(gl, () => {});
  }

  /**
   * Draws the full-screen colour wash. `color` is an EDG hex string resolved through
   * `rgbOf` (never a literal in the shader — the palette rule reaches the GPU through
   * this call, exactly like the WebGPU original); `alpha` in `[0,1]`.
   *
   * Sets its own blend function (`ONE, ONE_MINUS_SRC_ALPHA`, matching the WGSL
   * pipeline's premultiplied source-over blend state) and enables `gl.BLEND`, so
   * callers do not need to pre-configure blend state for this pass — but a pass
   * drawn immediately afterward that needs different blending (there is none after
   * this one; it draws last) must set its own state, per this backend's per-pass
   * convention.
   *
   * Callers should skip calling `draw` entirely when `alpha <= 0` (mirrors the
   * `wash.alpha > 0.001` gate the renderer applies before invoking this pass) —
   * this method does not gate on alpha itself so a caller can still force a draw
   * (e.g. for a test) at `alpha === 0`.
   */
  draw(color: string, alpha: number): void {
    const gl = this.gl;
    const [r255, g255, b255] = rgbOf(color);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniform3f(this.uniforms.u_color, (r255 ?? 0) / 255, (g255 ?? 0) / 255, (b255 ?? 0) / 255);
    gl.uniform1f(this.uniforms.u_alpha, alpha);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
  }
}
