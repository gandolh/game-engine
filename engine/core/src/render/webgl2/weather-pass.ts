// weather-pass.ts — GPU weather pass (rain/snow), WebGL2 port of
// ../webgpu/weather-pass.ts. See ./shaders/weather.{vert,frag}.glsl for the
// shader-side half of this port and their doc comments for the byte layout /
// view-uniform convention / the vs_streak+vs_snow → one-program-two-VAOs fold.
//
// Same "no pass encoder / no bind group" adaptation as ./particle-batch.ts: `draw`
// takes the per-frame `ViewUniform` explicitly instead of relying on an implicit
// shared binding a caller set up earlier.
//
// Caller contract (mirrors ../webgpu/renderer.ts's usage of WeatherPass exactly):
// only call `draw` when `weather instanceof RainField` — see this module's export
// and the brief handoff for the full `useGpuEffects` / `instanceof RainField`
// branch restatement. A non-RainField `WeatherLike` must never reach this class;
// it takes the CPU `weather.draw(ctx)` path instead (proved by
// ./weather-pass.test.ts's "dual-path" describe block).

import vertSrc from "./shaders/weather.vert.glsl?raw";
import fragSrc from "./shaders/weather.frag.glsl?raw";
import type { GlContext } from "./gl-context";
import { compileProgram, uniformLocations, createVao, setupAttrib } from "./program";
import type { ViewUniform } from "../view-uniform";
import type { RainField } from "../rain-field";
import { rgbOf } from "../palette";

const STREAK_FLOATS = 5; // p0.xy, p1.xy, halfWidth
const SNOW_FLOATS = 3;   // center.xy, halfSize
const STREAK_STRIDE_BYTES = STREAK_FLOATS * 4;
const SNOW_STRIDE_BYTES = SNOW_FLOATS * 4;

const INITIAL_CAPACITY = 512;

const STREAK_HALF_WIDTH = 0.35;

// Attribute locations — must match the `layout(location = N)` declarations in
// weather.vert.glsl.
const LOC_P0 = 0;
const LOC_P1 = 1;
const LOC_HALF_WIDTH = 2;
const LOC_CENTER = 3;
const LOC_HALF_SIZE = 4;

const UNIFORM_NAMES = ["u_scale", "u_offset", "u_isSnow", "u_color", "u_curtainAlpha"] as const;

export class WeatherPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;

  private readonly rainVao: WebGLVertexArrayObject;
  private rainInstanceBuffer: WebGLBuffer;
  private rainInstanceCapacity: number;
  private rainStagingData: Float32Array;

  private readonly snowVao: WebGLVertexArrayObject;
  private snowInstanceBuffer: WebGLBuffer;
  private snowInstanceCapacity: number;
  private snowStagingData: Float32Array;

  constructor(ctx: GlContext) {
    const gl = ctx.gl;
    this.gl = gl;
    this.program = compileProgram(gl, vertSrc, fragSrc, "weather");
    this.uniforms = uniformLocations(gl, this.program, UNIFORM_NAMES);

    this.rainInstanceCapacity = INITIAL_CAPACITY;
    this.rainStagingData = new Float32Array(INITIAL_CAPACITY * STREAK_FLOATS);
    this.rainInstanceBuffer = this._createBuffer(INITIAL_CAPACITY * STREAK_STRIDE_BYTES);
    this.rainVao = createVao(gl, (g) => this._bindRainAttribs(g, this.rainInstanceBuffer));

    this.snowInstanceCapacity = INITIAL_CAPACITY;
    this.snowStagingData = new Float32Array(INITIAL_CAPACITY * SNOW_FLOATS);
    this.snowInstanceBuffer = this._createBuffer(INITIAL_CAPACITY * SNOW_STRIDE_BYTES);
    this.snowVao = createVao(gl, (g) => this._bindSnowAttribs(g, this.snowInstanceBuffer));
  }

  draw(target: GlContext, view: ViewUniform, weather: RainField): void {
    if (target.isLost()) return;
    const kind = weather.weatherKind;
    if (kind === "none" || weather.count === 0) return;

    const gl = this.gl;

    const [r255, g255, b255] = rgbOf(weather.streakColor);
    const cr = (r255 ?? 0) / 255;
    const cg = (g255 ?? 0) / 255;
    const cb = (b255 ?? 0) / 255;
    const ca = weather.curtainAlpha;

    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.u_scale, view.scaleX, view.scaleY);
    gl.uniform2f(this.uniforms.u_offset, view.offsetX, view.offsetY);
    gl.uniform3f(this.uniforms.u_color, cr, cg, cb);
    gl.uniform1f(this.uniforms.u_curtainAlpha, ca);

    // Blend: literal translation of weather.wgsl's blend descriptor — identical to
    // particle.wgsl's (both: srcFactor "one", dstFactor "one-minus-src-alpha",
    // operation "add", on BOTH the color and alpha channel). The brief's caution
    // to "not assume one blend mode for both" was checked against both WGSL
    // `createRenderPipeline` blend descriptors directly (particle-batch.ts lines
    // ~121-132, weather-pass.ts lines ~80-91 in ../webgpu/) — they are the same
    // premultiplied-"over" state, not one additive + one premultiplied.
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    if (kind === "rain") {
      this._drawRain(weather);
    } else {
      this._drawSnow(weather);
    }
  }

  private _drawRain(weather: RainField): void {
    const gl = this.gl;
    const count = weather.count;

    if (count > this.rainInstanceCapacity) {
      let newCap = this.rainInstanceCapacity;
      while (newCap < count) newCap *= 2;
      this.rainInstanceBuffer = this._createBuffer(newCap * STREAK_STRIDE_BYTES);
      this.rainStagingData = new Float32Array(newCap * STREAK_FLOATS);
      gl.bindVertexArray(this.rainVao);
      this._bindRainAttribs(gl, this.rainInstanceBuffer);
      gl.bindVertexArray(null);
      this.rainInstanceCapacity = newCap;
    }

    let i = 0;
    weather.forEachRainStreak((x0, y0, x1, y1) => {
      const base = i * STREAK_FLOATS;
      this.rainStagingData[base + 0] = x0;
      this.rainStagingData[base + 1] = y0;
      this.rainStagingData[base + 2] = x1;
      this.rainStagingData[base + 3] = y1;
      this.rainStagingData[base + 4] = STREAK_HALF_WIDTH;
      i++;
    });

    const writtenCount = i;
    if (writtenCount === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.rainInstanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.rainStagingData, 0, writtenCount * STREAK_FLOATS);

    gl.uniform1f(this.uniforms.u_isSnow, 0.0);
    gl.bindVertexArray(this.rainVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, writtenCount);
    gl.bindVertexArray(null);
  }

  private _drawSnow(weather: RainField): void {
    const gl = this.gl;
    const count = weather.count;

    if (count > this.snowInstanceCapacity) {
      let newCap = this.snowInstanceCapacity;
      while (newCap < count) newCap *= 2;
      this.snowInstanceBuffer = this._createBuffer(newCap * SNOW_STRIDE_BYTES);
      this.snowStagingData = new Float32Array(newCap * SNOW_FLOATS);
      gl.bindVertexArray(this.snowVao);
      this._bindSnowAttribs(gl, this.snowInstanceBuffer);
      gl.bindVertexArray(null);
      this.snowInstanceCapacity = newCap;
    }

    let i = 0;
    weather.forEachSnowFlake((cx, cy, halfSize) => {
      const base = i * SNOW_FLOATS;
      this.snowStagingData[base + 0] = cx;
      this.snowStagingData[base + 1] = cy;
      this.snowStagingData[base + 2] = halfSize;
      i++;
    });

    const writtenCount = i;
    if (writtenCount === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.snowInstanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.snowStagingData, 0, writtenCount * SNOW_FLOATS);

    gl.uniform1f(this.uniforms.u_isSnow, 1.0);
    gl.bindVertexArray(this.snowVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, writtenCount);
    gl.bindVertexArray(null);
  }

  private _createBuffer(byteLength: number): WebGLBuffer {
    const gl = this.gl;
    const buf = gl.createBuffer();
    if (!buf) throw new Error("webgl2: gl.createBuffer() returned null (WeatherPass instance buffer)");
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, byteLength, gl.DYNAMIC_DRAW);
    return buf;
  }

  private _bindRainAttribs(gl: WebGL2RenderingContext, buffer: WebGLBuffer): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    setupAttrib(gl, { location: LOC_P0, size: 2, type: gl.FLOAT, stride: STREAK_STRIDE_BYTES, offset: 0, divisor: 1 });
    setupAttrib(gl, { location: LOC_P1, size: 2, type: gl.FLOAT, stride: STREAK_STRIDE_BYTES, offset: 8, divisor: 1 });
    setupAttrib(gl, { location: LOC_HALF_WIDTH, size: 1, type: gl.FLOAT, stride: STREAK_STRIDE_BYTES, offset: 16, divisor: 1 });
  }

  private _bindSnowAttribs(gl: WebGL2RenderingContext, buffer: WebGLBuffer): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    setupAttrib(gl, { location: LOC_CENTER, size: 2, type: gl.FLOAT, stride: SNOW_STRIDE_BYTES, offset: 0, divisor: 1 });
    setupAttrib(gl, { location: LOC_HALF_SIZE, size: 1, type: gl.FLOAT, stride: SNOW_STRIDE_BYTES, offset: 8, divisor: 1 });
  }
}
