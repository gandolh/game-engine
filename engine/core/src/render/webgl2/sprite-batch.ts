// sprite-batch.ts — WebGL2 port of ../webgpu/sprite-batch.ts (`SpriteBatch`).
//
// Read shaders/sprite.vert.glsl + shaders/sprite.frag.glsl's header comments first —
// they document the per-instance byte layout and the view-transform convention this
// file packs data for / feeds uniforms into.
//
// Blend state: the WebGPU pipeline's blend descriptor (both color and alpha
// channels) is srcFactor "one", dstFactor "one-minus-src-alpha", operation "add".
// Translated literally below as:
//   gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
//   gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD)
// This is NOT the common SRC_ALPHA/ONE_MINUS_SRC_ALPHA pairing — the fragment
// shader already outputs premultiplied colour (see sprite.frag.glsl), and the
// context itself is `premultipliedAlpha: true` (gl-context.ts). Using SRC_ALPHA
// here would double-multiply alpha into the RGB and produce dark edge fringes.
//
// View uniform: WebGPU binds the view via a shared bind group (group 0), set once
// per render pass by the orchestrator, not by SpriteBatch itself. WebGL2 has no
// bind-group equivalent for sharing state across independently-compiled programs
// without a UBO, and the brief permits (does not mandate) a UBO — so this batch
// exposes one extra method beyond the byte-identical surface, `setView(view)`,
// which the caller (brief 08's renderer) must call once per frame, before any
// `drawRange` calls, exactly where it would otherwise do `pass.setBindGroup(0, ...)`.
// See the handoff notes in the brief's completion report for the exact call order.
import vertSrc from "./shaders/sprite.vert.glsl?raw";
import fragSrc from "./shaders/sprite.frag.glsl?raw";
import { compileProgram, uniformLocations, setupAttrib, createVao } from "./program";
import type { ViewUniform } from "../view-uniform";

export interface GlSpriteInstance {
  x: number;
  y: number;
  w: number;
  h: number;

  u0: number;
  v0: number;
  u1: number;
  v1: number;

  rotation: number;
  flipX: 0 | 1;

  r: number;
  g: number;
  b: number;
  a: number;

  swayPhase: number;

  swayAmp: number;
}

const FLOATS_PER_INSTANCE = 16;
const STRIDE_BYTES = FLOATS_PER_INSTANCE * 4;

const INITIAL_CAPACITY = 512;

/** Attribute locations — MUST match the `layout(location = N)` declarations in
 *  shaders/sprite.vert.glsl exactly. Brief 08 does not touch this file, but if a
 *  future pass ever needs to share these locations, they live here. */
const LOC = {
  pos: 0,
  size: 1,
  uvMin: 2,
  uvMax: 3,
  rotation: 4,
  flipX: 5,
  tint: 6,
  swayPhase: 7,
  swayAmp: 8,
} as const;

const UNIFORM_NAMES = ["u_scale", "u_offset", "u_time_sec", "u_wind_strength", "u_atlas"] as const;

export class SpriteBatch {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;
  private readonly vao: WebGLVertexArrayObject;

  private stagingData: Float32Array;

  private instanceBuffer: WebGLBuffer;
  private instanceCapacity: number;

  private cursor = 0;

  private lastView: ViewUniform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, timeSec: 0, windStrength: 1 };

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = compileProgram(gl, vertSrc, fragSrc, "sprite");
    this.uniforms = uniformLocations(gl, this.program, UNIFORM_NAMES);

    this.instanceCapacity = INITIAL_CAPACITY;
    this.stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    this.vao = createVao(gl, (g) => {
      g.bindBuffer(g.ARRAY_BUFFER, this.instanceBuffer);
      this._setupInstanceAttribs(0);
    });
  }

  begin(): void {
    this.cursor = 0;
  }

  get count(): number {
    return this.cursor;
  }

  /** Must be called once per frame, before any `drawRange` calls — the GL analogue
   *  of the WebGPU orchestrator's `pass.setBindGroup(0, viewBindGroup)`. */
  setView(view: ViewUniform): void {
    this.lastView = view;
  }

  add(inst: GlSpriteInstance): number {
    const index = this.cursor;
    const neededFloats = (index + 1) * FLOATS_PER_INSTANCE;
    if (neededFloats > this.stagingData.length) {
      const grown = new Float32Array(this.stagingData.length * 2);
      grown.set(this.stagingData);
      this.stagingData = grown;
    }
    const base = index * FLOATS_PER_INSTANCE;
    this.stagingData[base + 0] = inst.x;
    this.stagingData[base + 1] = inst.y;
    this.stagingData[base + 2] = inst.w;
    this.stagingData[base + 3] = inst.h;
    this.stagingData[base + 4] = inst.u0;
    this.stagingData[base + 5] = inst.v0;
    this.stagingData[base + 6] = inst.u1;
    this.stagingData[base + 7] = inst.v1;
    this.stagingData[base + 8] = inst.rotation;
    this.stagingData[base + 9] = inst.flipX;
    this.stagingData[base + 10] = inst.r;
    this.stagingData[base + 11] = inst.g;
    this.stagingData[base + 12] = inst.b;
    this.stagingData[base + 13] = inst.a;
    this.stagingData[base + 14] = inst.swayPhase;
    this.stagingData[base + 15] = inst.swayAmp;
    this.cursor = index + 1;
    return index;
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
      // The VAO's attribute state was bound against the old buffer object;
      // drawRange always rebinds the (current) instance buffer + attribs before
      // drawing, so no extra VAO surgery is needed here — see drawRange below.
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.stagingData, 0, count * FLOATS_PER_INSTANCE);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * Draws instances `[first, first + count)` from the currently uploaded buffer.
   * Signature is the one change the brief permits: WebGPU's
   * `drawRange(pass: GPURenderPassEncoder, atlasBindGroup: GPUBindGroup, first, count)`
   * becomes `drawRange(gl, atlasTexture, first, count)` — GL context + texture
   * handle standing in for the pass encoder + bind group.
   *
   * WebGL2's `drawArraysInstanced` has no `firstInstance` parameter (unlike
   * WebGPU's `draw(vertexCount, instanceCount, firstVertex, firstInstance)` —
   * there is no ANGLE/core WebGL2 equivalent of `glDrawArraysInstancedBaseInstance`).
   * The workaround, standard for GL: re-point every per-instance attribute at
   * `first * STRIDE_BYTES` into the instance buffer before the draw, then always
   * draw instances `[0, count)` relative to that offset.
   */
  drawRange(gl: WebGL2RenderingContext, atlasTexture: WebGLTexture, first: number, count: number): void {
    if (count === 0) return;

    gl.useProgram(this.program);

    const view = this.lastView;
    gl.uniform2f(this.uniforms.u_scale, view.scaleX, view.scaleY);
    gl.uniform2f(this.uniforms.u_offset, view.offsetX, view.offsetY);
    gl.uniform1f(this.uniforms.u_time_sec, view.timeSec);
    gl.uniform1f(this.uniforms.u_wind_strength, view.windStrength);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.uniform1i(this.uniforms.u_atlas, 0);

    // Premultiplied-alpha blend, translated literally from the WebGPU pipeline's
    // blend descriptor (see file header comment).
    gl.enable(gl.BLEND);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    this._setupInstanceAttribs(first * STRIDE_BYTES);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);

    gl.bindVertexArray(null);
  }

  private _createInstanceBuffer(capacity: number): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error("webgl2: gl.createBuffer() returned null for SpriteBatch instance buffer");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * STRIDE_BYTES, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return buffer;
  }

  /** (Re)points every per-instance attribute at `byteOffset` into whichever buffer
   *  is currently bound to `ARRAY_BUFFER` — the `first`-instance offset trick used
   *  by drawRange. Must be called with the target VAO already bound. */
  private _setupInstanceAttribs(byteOffset: number): void {
    const gl = this.gl;
    setupAttrib(gl, { location: LOC.pos, size: 2, type: gl.FLOAT, stride: STRIDE_BYTES, offset: byteOffset + 0, divisor: 1 });
    setupAttrib(gl, { location: LOC.size, size: 2, type: gl.FLOAT, stride: STRIDE_BYTES, offset: byteOffset + 8, divisor: 1 });
    setupAttrib(gl, { location: LOC.uvMin, size: 2, type: gl.FLOAT, stride: STRIDE_BYTES, offset: byteOffset + 16, divisor: 1 });
    setupAttrib(gl, { location: LOC.uvMax, size: 2, type: gl.FLOAT, stride: STRIDE_BYTES, offset: byteOffset + 24, divisor: 1 });
    setupAttrib(gl, { location: LOC.rotation, size: 1, type: gl.FLOAT, stride: STRIDE_BYTES, offset: byteOffset + 32, divisor: 1 });
    setupAttrib(gl, { location: LOC.flipX, size: 1, type: gl.FLOAT, stride: STRIDE_BYTES, offset: byteOffset + 36, divisor: 1 });
    setupAttrib(gl, { location: LOC.tint, size: 4, type: gl.FLOAT, stride: STRIDE_BYTES, offset: byteOffset + 40, divisor: 1 });
    setupAttrib(gl, { location: LOC.swayPhase, size: 1, type: gl.FLOAT, stride: STRIDE_BYTES, offset: byteOffset + 56, divisor: 1 });
    setupAttrib(gl, { location: LOC.swayAmp, size: 1, type: gl.FLOAT, stride: STRIDE_BYTES, offset: byteOffset + 60, divisor: 1 });
  }
}
