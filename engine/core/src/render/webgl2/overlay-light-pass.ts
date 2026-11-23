// overlay-light-pass.ts — additive screen-space light pass (brief 05, redrawn on the GPU by brief 16).
//
// Farm's night glows: one instanced quad per light pool, additive blending
// (`gl.blendFunc(gl.ONE, gl.ONE)`), with the radial falloff computed in the fragment shader. Before
// brief 16 the glows were painted with the CPU 2D canvas into an offscreen canvas that was uploaded
// as a texture every frame (7.26 MB a frame at 1920x945). Nothing in this pass allocates or uploads
// a texture now; the per-frame upload is one small instance buffer.
//
// Ordered AFTER sprites and BEFORE the day/night wash (`TintPass`), so the wash's translucent
// colour composites over the lit scene and a night glow still reads as "glowing at night". The
// pass is a complete no-op, with no GL call, when no `LightOverlay` is supplied (Citadel and
// MateQuest pass none) or when it holds no pools.
//
// Blend state: sets `gl.blendFunc(gl.ONE, gl.ONE)` itself and leaves `gl.BLEND` enabled —
// `TintPass.draw`, called right after, sets its own blend function, so no restore is needed here.
import { compileProgram, uniformLocations, setupAttrib, createVao } from "./program";
import type { LightOverlay } from "../renderer";
import vertSrc from "./shaders/overlay-light.vert.glsl?raw";
import fragSrc from "./shaders/overlay-light.frag.glsl?raw";

/**
 * The screen-pixel view the pools are positioned by: positive scale, device-pixel offsets,
 * mirroring `Overlay2D.applyWorldTransform`'s `ViewUniform` variant (NOT the GPU clip-space one).
 */
export interface OverlayLightView {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

/** Where the first falloff stop sits, as a fraction of the radius. The shader reads it as a uniform. */
export const LIGHT_FALLOFF_MID_AT = 0.45;
/** The share of the peak alpha left at `LIGHT_FALLOFF_MID_AT`. The shader reads it as a uniform. */
export const LIGHT_FALLOFF_MID_SHARE = 0.4;

/**
 * The share of a pool's peak alpha at `t`, its distance from the centre over its radius: 1 at 0,
 * `LIGHT_FALLOFF_MID_SHARE` at `LIGHT_FALLOFF_MID_AT`, 0 at 1, linear between. The CPU twin of
 * `shaders/overlay-light.frag.glsl`, the three stops the old canvas gradient had.
 */
export function lightFalloff(t: number): number {
  if (t >= 1) return 0;
  if (t < LIGHT_FALLOFF_MID_AT) return 1 - (1 - LIGHT_FALLOFF_MID_SHARE) * (t / LIGHT_FALLOFF_MID_AT);
  return LIGHT_FALLOFF_MID_SHARE * (1 - (t - LIGHT_FALLOFF_MID_AT) / (1 - LIGHT_FALLOFF_MID_AT));
}

const FLOATS_PER_INSTANCE = 8;
const STRIDE_BYTES = FLOATS_PER_INSTANCE * 4;
const INITIAL_CAPACITY = 64;

/** Attribute locations — MUST match shaders/overlay-light.vert.glsl's `layout(location = N)`. */
const LOC = { pool: 0, color: 1 } as const;

const UNIFORM_NAMES = ["u_scale", "u_offset", "u_stops"] as const;

export class OverlayLightPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;
  private readonly vao: WebGLVertexArrayObject;

  private stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
  private instanceBuffer: WebGLBuffer;
  private instanceCapacity = INITIAL_CAPACITY;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = compileProgram(gl, vertSrc, fragSrc, "overlay-light");
    this.uniforms = uniformLocations(gl, this.program, UNIFORM_NAMES);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    // Attribute state is rebound in `draw()`: growing the buffer replaces the WebGLBuffer, and a
    // VAO's attribute bindings capture the buffer object. Same pattern as ShadowBatch.
    this.vao = createVao(gl, () => {});
  }

  /**
   * Draws `overlay`'s pools additively as one instanced draw call. A no-op, with no GL call, when
   * `overlay` is `undefined` or holds no pools. `drawingBufferWidth`/`drawingBufferHeight` are the GL
   * backing store's size in device pixels, which turn `view` into clip space.
   */
  draw(
    overlay: LightOverlay | undefined,
    view: OverlayLightView,
    drawingBufferWidth: number,
    drawingBufferHeight: number,
  ): void {
    if (overlay === undefined) return;
    const count = Math.min(overlay.count, overlay.pools.length);
    if (count <= 0) return;
    if (drawingBufferWidth <= 0 || drawingBufferHeight <= 0) return;

    const gl = this.gl;

    if (count * FLOATS_PER_INSTANCE > this.stagingData.length) {
      let cap = this.instanceCapacity;
      while (cap < count) cap *= 2;
      this.stagingData = new Float32Array(cap * FLOATS_PER_INSTANCE);
      gl.deleteBuffer(this.instanceBuffer);
      this.instanceBuffer = this._createInstanceBuffer(cap);
      this.instanceCapacity = cap;
    }

    const data = this.stagingData;
    for (let i = 0; i < count; i += 1) {
      const p = overlay.pools[i];
      if (p === undefined) break;
      const base = i * FLOATS_PER_INSTANCE;
      data[base + 0] = p.cx;
      data[base + 1] = p.cy;
      data[base + 2] = p.radius;
      data[base + 3] = p.peak;
      data[base + 4] = p.r;
      data[base + 5] = p.g;
      data[base + 6] = p.b;
      data[base + 7] = 0;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * FLOATS_PER_INSTANCE);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.u_scale, (view.sx * 2) / drawingBufferWidth, (-view.sy * 2) / drawingBufferHeight);
    gl.uniform2f(
      this.uniforms.u_offset,
      (view.ox * 2) / drawingBufferWidth - 1,
      1 - (view.oy * 2) / drawingBufferHeight,
    );
    gl.uniform2f(this.uniforms.u_stops, LIGHT_FALLOFF_MID_AT, LIGHT_FALLOFF_MID_SHARE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    setupAttrib(gl, { location: LOC.pool, size: 4, type: gl.FLOAT, stride: STRIDE_BYTES, offset: 0, divisor: 1 });
    setupAttrib(gl, { location: LOC.color, size: 4, type: gl.FLOAT, stride: STRIDE_BYTES, offset: 16, divisor: 1 });
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    gl.bindVertexArray(null);
  }

  private _createInstanceBuffer(capacity: number): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("webgl2: gl.createBuffer() returned null for OverlayLightPass instance buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * STRIDE_BYTES, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return buffer;
  }
}
