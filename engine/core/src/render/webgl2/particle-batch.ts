// particle-batch.ts — instanced particle pipeline, WebGL2 port of
// ../webgpu/particle-batch.ts. See ./shaders/particle.{vert,frag}.glsl for the
// shader-side half of this port and their doc comments for the byte layout /
// view-uniform convention (unchanged from the WGSL original).
//
// WebGPU's `draw(pass: GPURenderPassEncoder, particles: ParticleSystem)` relied on
// a view bind group already set on the pass by the renderer before any pass drew
// (`pass.setBindGroup(0, viewBindGroup)`, once per frame). WebGL2 has no pass-encoder/
// bind-group equivalent — GL state is global, not scoped to a "pass" object — so
// this port's `draw` takes the per-frame `ViewUniform` explicitly as a second
// argument instead of relying on an implicit shared binding. See this file's
// module doc in the brief handoff for why (no wave-2 sibling brief had committed a
// shared-view-UBO convention at the time this was written).

import vertSrc from "./shaders/particle.vert.glsl?raw";
import fragSrc from "./shaders/particle.frag.glsl?raw";
import type { GlContext } from "./gl-context";
import { compileProgram, uniformLocations, createVao, setupAttrib } from "./program";
import type { ViewUniform } from "../view-uniform";
import type { ParticleSystem } from "../particles";

const FLOATS_PER_INSTANCE = 8;
const STRIDE_BYTES = FLOATS_PER_INSTANCE * 4;

const INITIAL_CAPACITY = 256;

const SHAPE_ID_CIRCLE = 0.0;
const SHAPE_ID_RECT = 1.0;
const SHAPE_ID_STAR = 2.0;

// Attribute locations — must match the `layout(location = N)` declarations in
// particle.vert.glsl.
const LOC_CENTER = 0;
const LOC_SIZE = 1;
const LOC_SHAPE_ID = 2;
const LOC_COLOR = 3;

const UNIFORM_NAMES = ["u_scale", "u_offset"] as const;

export class ParticleBatch {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;

  private readonly vao: WebGLVertexArrayObject;

  private instanceBuffer: WebGLBuffer;
  private instanceCapacity: number;
  private stagingData: Float32Array;

  constructor(ctx: GlContext) {
    const gl = ctx.gl;
    this.gl = gl;
    this.program = compileProgram(gl, vertSrc, fragSrc, "particle");
    this.uniforms = uniformLocations(gl, this.program, UNIFORM_NAMES);

    this.instanceCapacity = INITIAL_CAPACITY;
    this.stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    this.vao = createVao(gl, (g) => this._bindAttribs(g, this.instanceBuffer));
  }

  draw(target: GlContext, view: ViewUniform, particles: ParticleSystem): void {
    if (target.isLost()) return;
    if (particles.count === 0) return;

    const gl = this.gl;
    const count = particles.count;

    if (count > this.instanceCapacity) {
      let newCap = this.instanceCapacity;
      while (newCap < count) newCap *= 2;
      this.instanceBuffer = this._createInstanceBuffer(newCap);
      this.stagingData = new Float32Array(newCap * FLOATS_PER_INSTANCE);
      gl.bindVertexArray(this.vao);
      this._bindAttribs(gl, this.instanceBuffer);
      gl.bindVertexArray(null);
      this.instanceCapacity = newCap;
    }

    let i = 0;
    particles.forEachParticle((v) => {
      const base = i * FLOATS_PER_INSTANCE;
      this.stagingData[base + 0] = v.x;
      this.stagingData[base + 1] = v.y;
      this.stagingData[base + 2] = v.size;
      this.stagingData[base + 3] =
        v.shape === "circle" ? SHAPE_ID_CIRCLE :
        v.shape === "rect" ? SHAPE_ID_RECT :
        SHAPE_ID_STAR;

      this.stagingData[base + 4] = v.r / 255;
      this.stagingData[base + 5] = v.g / 255;
      this.stagingData[base + 6] = v.b / 255;
      this.stagingData[base + 7] = v.alpha;
      i++;
    });

    const writtenCount = i;
    if (writtenCount === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.stagingData, 0, writtenCount * FLOATS_PER_INSTANCE);

    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.u_scale, view.scaleX, view.scaleY);
    gl.uniform2f(this.uniforms.u_offset, view.offsetX, view.offsetY);

    // Blend: literal translation of particle.wgsl's blend descriptor —
    //   color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
    //   alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
    // i.e. standard premultiplied-alpha "over" compositing on BOTH channels — not
    // additive (additive would be dstFactor "one" with no alpha attenuation).
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, writtenCount);
    gl.bindVertexArray(null);
  }

  private _createInstanceBuffer(capacity: number): WebGLBuffer {
    const gl = this.gl;
    const buf = gl.createBuffer();
    if (!buf) throw new Error("webgl2: gl.createBuffer() returned null (ParticleBatch instance buffer)");
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * STRIDE_BYTES, gl.DYNAMIC_DRAW);
    return buf;
  }

  private _bindAttribs(gl: WebGL2RenderingContext, buffer: WebGLBuffer): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    setupAttrib(gl, { location: LOC_CENTER, size: 2, type: gl.FLOAT, stride: STRIDE_BYTES, offset: 0, divisor: 1 });
    setupAttrib(gl, { location: LOC_SIZE, size: 1, type: gl.FLOAT, stride: STRIDE_BYTES, offset: 8, divisor: 1 });
    setupAttrib(gl, { location: LOC_SHAPE_ID, size: 1, type: gl.FLOAT, stride: STRIDE_BYTES, offset: 12, divisor: 1 });
    setupAttrib(gl, { location: LOC_COLOR, size: 4, type: gl.FLOAT, stride: STRIDE_BYTES, offset: 16, divisor: 1 });
  }
}
