// shadow-batch.ts — WebGL2 port of ../webgpu/shadow-batch.ts (`ShadowBatch`, inline
// WGSL). Read shaders/shadow.vert.glsl + shaders/shadow.frag.glsl's header comments
// first — they document the per-instance byte layout and view-transform convention.
//
// No atlas/texture involved (shadows are a solid-colour ellipse), so there is no
// `drawRange` split by texture — this mirrors the WGSL original's single
// `draw(pass)` that always draws the whole `[0, cursor)` range in one call.
// The one permitted signature change (GL context replacing the pass encoder,
// no bind group to replace since there was none) becomes `draw(gl)`.
//
// Blend state and view-uniform handling are identical in spirit to sprite-batch.ts
// — see that file's header comment for the full blend-state rationale. This batch
// only needs (scaleX, scaleY, offsetX, offsetY), a subset of the full `ViewUniform`
// (no time/wind — shadows don't sway).
import vertSrc from "./shaders/shadow.vert.glsl?raw";
import fragSrc from "./shaders/shadow.frag.glsl?raw";
import { compileProgram, uniformLocations, setupAttrib, createVao } from "./program";
import type { ViewUniform } from "../view-uniform";

const FLOATS_PER_INSTANCE = 8;
const STRIDE_BYTES = FLOATS_PER_INSTANCE * 4;

const INITIAL_CAPACITY = 64;

/** Attribute locations — MUST match shaders/shadow.vert.glsl's `layout(location = N)`. */
const LOC = {
  posRadii: 0,
  color: 1,
} as const;

const UNIFORM_NAMES = ["u_scale", "u_offset"] as const;

export class ShadowBatch {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;
  private readonly vao: WebGLVertexArrayObject;

  private stagingData: Float32Array;

  private instanceBuffer: WebGLBuffer;
  private instanceCapacity: number;

  private cursor = 0;

  private lastView: Pick<ViewUniform, "scaleX" | "scaleY" | "offsetX" | "offsetY"> = {
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  };

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = compileProgram(gl, vertSrc, fragSrc, "shadow");
    this.uniforms = uniformLocations(gl, this.program, UNIFORM_NAMES);

    this.instanceCapacity = INITIAL_CAPACITY;
    this.stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    // Only creates the VAO object here; attribute state is (re)bound in `draw()`
    // every call — required because growing `instanceBuffer` (see `upload()`)
    // replaces the WebGLBuffer object, and a VAO's attribute bindings capture the
    // actual buffer object, not "whatever is currently ARRAY_BUFFER-bound". A VAO
    // built once against the original buffer would silently point at a deleted
    // buffer after the first grow. Same pattern as SpriteBatch.drawRange.
    this.vao = createVao(gl, () => {});
  }

  begin(): void {
    this.cursor = 0;
  }

  get count(): number {
    return this.cursor;
  }

  /** Must be called once per frame, before `draw` — the GL analogue of the WebGPU
   *  orchestrator's `pass.setBindGroup(0, viewBindGroup)`. Only the 4 clip-space
   *  scale/offset fields are read; extra `ViewUniform` fields are ignored. */
  setView(view: Pick<ViewUniform, "scaleX" | "scaleY" | "offsetX" | "offsetY">): void {
    this.lastView = view;
  }

  add(x: number, y: number, rx: number, ry: number, r: number, g: number, b: number, alpha: number): void {
    const index = this.cursor;
    const neededFloats = (index + 1) * FLOATS_PER_INSTANCE;
    if (neededFloats > this.stagingData.length) {
      const grown = new Float32Array(this.stagingData.length * 2);
      grown.set(this.stagingData);
      this.stagingData = grown;
    }
    const base = index * FLOATS_PER_INSTANCE;
    this.stagingData[base + 0] = x;
    this.stagingData[base + 1] = y;
    this.stagingData[base + 2] = rx;
    this.stagingData[base + 3] = ry;
    this.stagingData[base + 4] = r;
    this.stagingData[base + 5] = g;
    this.stagingData[base + 6] = b;
    this.stagingData[base + 7] = alpha;
    this.cursor = index + 1;
  }

  upload(): void {
    const gl = this.gl;
    const count = this.cursor;
    if (count === 0) return;

    if (count > this.instanceCapacity) {
      let newCap = this.instanceCapacity;
      while (newCap < count) newCap *= 2;
      gl.deleteBuffer(this.instanceBuffer);
      this.instanceBuffer = this._createInstanceBuffer(newCap);
      this.instanceCapacity = newCap;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.stagingData, 0, count * FLOATS_PER_INSTANCE);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** Draws the whole `[0, count)` range in one `drawArraysInstanced` call — see
   *  the file header comment for why there is no `drawRange` split here. */
  draw(gl: WebGL2RenderingContext): void {
    const count = this.cursor;
    if (count === 0) return;

    gl.useProgram(this.program);

    const view = this.lastView;
    gl.uniform2f(this.uniforms.u_scale, view.scaleX, view.scaleY);
    gl.uniform2f(this.uniforms.u_offset, view.offsetX, view.offsetY);

    // Premultiplied-alpha blend, translated literally from the WebGPU pipeline's
    // blend descriptor (srcFactor=one, dstFactor=one-minus-src-alpha, op=add on
    // both channels) — same rationale as sprite-batch.ts's drawRange.
    gl.enable(gl.BLEND);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    setupAttrib(gl, { location: LOC.posRadii, size: 4, type: gl.FLOAT, stride: STRIDE_BYTES, offset: 0, divisor: 1 });
    setupAttrib(gl, { location: LOC.color, size: 4, type: gl.FLOAT, stride: STRIDE_BYTES, offset: 16, divisor: 1 });
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    gl.bindVertexArray(null);
  }

  private _createInstanceBuffer(capacity: number): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error("webgl2: gl.createBuffer() returned null for ShadowBatch instance buffer");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * STRIDE_BYTES, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return buffer;
  }
}
