import { describe, it, expect, vi } from "vitest";
import { createGlContext, GlContext } from "./gl-context";
import { WeatherPass } from "./weather-pass";
import type { ViewUniform } from "../view-uniform";
import { EDG } from "../palette";
import { RainField } from "../rain-field";
import type { WeatherLike } from "../renderer";

// node's vitest env has no real WebGL2. Per project convention (mock GL objects,
// never a real context), this drives WeatherPass against a fake
// WebGL2RenderingContext wrapped in a real GlContext, mirroring
// ../webgpu/weather-pass.test.ts (the file this ports) and ./particle-batch.test.ts.

interface Call {
  fn: string;
  args: unknown[];
}

function makeFakeGl(): WebGL2RenderingContext & { calls: Call[] } {
  const calls: Call[] = [];
  const record = (fn: string) => (...args: unknown[]) => {
    calls.push({ fn, args });
  };

  const gl = {
    calls,
    ARRAY_BUFFER: 1, DYNAMIC_DRAW: 2, FLOAT: 3, TRIANGLES: 4,
    VERTEX_SHADER: 5, FRAGMENT_SHADER: 6, COMPILE_STATUS: 7, LINK_STATUS: 8,
    BLEND: 9, FUNC_ADD: 10, ONE: 11, ONE_MINUS_SRC_ALPHA: 12,

    createShader: vi.fn(() => ({ __kind: "shader" })),
    shaderSource: vi.fn(record("shaderSource")),
    compileShader: vi.fn(record("compileShader")),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(record("deleteShader")),

    createProgram: vi.fn(() => ({ __kind: "program" })),
    attachShader: vi.fn(record("attachShader")),
    linkProgram: vi.fn(record("linkProgram")),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    deleteProgram: vi.fn(record("deleteProgram")),

    getUniformLocation: vi.fn((_p: unknown, name: string) => ({ __uniform: name })),
    useProgram: vi.fn(record("useProgram")),
    uniform2f: vi.fn(record("uniform2f")),
    uniform1f: vi.fn(record("uniform1f")),
    uniform3f: vi.fn(record("uniform3f")),

    createVertexArray: vi.fn(() => ({ __kind: "vao" })),
    bindVertexArray: vi.fn(record("bindVertexArray")),
    enableVertexAttribArray: vi.fn(record("enableVertexAttribArray")),
    vertexAttribPointer: vi.fn(record("vertexAttribPointer")),
    vertexAttribDivisor: vi.fn(record("vertexAttribDivisor")),

    createBuffer: vi.fn(() => ({ __kind: "buffer" })),
    bindBuffer: vi.fn(record("bindBuffer")),
    bufferData: vi.fn(record("bufferData")),
    bufferSubData: vi.fn(record("bufferSubData")),

    enable: vi.fn(record("enable")),
    blendEquation: vi.fn(record("blendEquation")),
    blendFuncSeparate: vi.fn(record("blendFuncSeparate")),
    drawArraysInstanced: vi.fn(record("drawArraysInstanced")),

    viewport: vi.fn(),
    getExtension: vi.fn(() => null),
  };
  return gl as unknown as WebGL2RenderingContext & { calls: Call[] };
}

class FakeCanvas {
  width = 0;
  height = 0;
  private readonly _gl: unknown;
  constructor(gl: unknown) {
    this._gl = gl;
  }
  getContext(type: string): unknown {
    return type === "webgl2" ? this._gl : null;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

function makeCtx(): { ctx: GlContext; gl: WebGL2RenderingContext & { calls: Call[] } } {
  const gl = makeFakeGl();
  const canvas = new FakeCanvas(gl);
  const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);
  return { ctx, gl };
}

const VIEW: ViewUniform = { scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0, timeSec: 0, windStrength: 1 };

function makeRainWeather(): RainField {
  return {
    weatherKind: "rain",
    count: 1,
    streakColor: EDG.white,
    curtainAlpha: 0.5,
    forEachRainStreak(cb: (x0: number, y0: number, x1: number, y1: number) => void): void {
      cb(0, 0, 1, 1);
    },
    forEachSnowFlake(): void {},
  } as unknown as RainField;
}

/** A REAL RainField instance (not a structural fake) — required for the
 *  dual-path tests below, which assert on `instanceof RainField` and must
 *  exercise the actual prototype check, not a duck-typed stand-in. */
function makeRealRainField(kind: "rain" | "snow"): RainField {
  const field = new RainField();
  field.setConfig({ kind, intensity: 1, color: EDG.white, alpha: 0.5 });
  field.update(1, { left: 0, right: 100, top: 0, bottom: 100 });
  return field;
}

function makeSnowWeather(): RainField {
  return {
    weatherKind: "snow",
    count: 2,
    streakColor: EDG.white,
    curtainAlpha: 0.4,
    forEachRainStreak(): void {},
    forEachSnowFlake(cb: (cx: number, cy: number, halfSize: number) => void): void {
      cb(0, 0, 1);
      cb(5, 5, 1.2);
    },
  } as unknown as RainField;
}

describe("WeatherPass program/VAO hoist (WebGL2 analogue of the WebGPU bind-group hoist)", () => {
  it("compiles the program and creates both VAOs once (in the constructor), not once per draw()", () => {
    const { ctx, gl } = makeCtx();
    new WeatherPass(ctx);
    expect(gl.calls.filter((c) => c.fn === "linkProgram")).toHaveLength(1);
    expect((gl.createVertexArray as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);

    const pass = new WeatherPass(ctx);
    const weather = makeRainWeather();
    pass.draw(ctx, VIEW, weather);
    pass.draw(ctx, VIEW, weather);
    pass.draw(ctx, VIEW, weather);

    // Two WeatherPass instances → two links/VAO pairs total; no extra ones from
    // the three draw() calls on the second instance.
    expect(gl.calls.filter((c) => c.fn === "linkProgram")).toHaveLength(2);
    expect((gl.createVertexArray as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(4);
    expect(gl.calls.filter((c) => c.fn === "drawArraysInstanced")).toHaveLength(3);
  });
});

describe("WeatherPass — rain", () => {
  it("draws rain with u_isSnow = 0 and one instanced draw call", () => {
    const { ctx, gl } = makeCtx();
    const pass = new WeatherPass(ctx);
    pass.draw(ctx, VIEW, makeRainWeather());

    const isSnowCalls = gl.calls.filter((c) => c.fn === "uniform1f" && (c.args[0] as { __uniform: string }).__uniform === "u_isSnow");
    expect(isSnowCalls).toHaveLength(1);
    expect(isSnowCalls[0]?.args[1]).toBe(0.0);

    const drawCalls = gl.calls.filter((c) => c.fn === "drawArraysInstanced");
    expect(drawCalls).toHaveLength(1);
    expect(drawCalls[0]?.args).toEqual([gl.TRIANGLES, 0, 6, 1]);
  });
});

describe("WeatherPass — snow", () => {
  it("draws snow with u_isSnow = 1 and one instanced draw call sized to the flake count", () => {
    const { ctx, gl } = makeCtx();
    const pass = new WeatherPass(ctx);
    pass.draw(ctx, VIEW, makeSnowWeather());

    const isSnowCalls = gl.calls.filter((c) => c.fn === "uniform1f" && (c.args[0] as { __uniform: string }).__uniform === "u_isSnow");
    expect(isSnowCalls).toHaveLength(1);
    expect(isSnowCalls[0]?.args[1]).toBe(1.0);

    const drawCalls = gl.calls.filter((c) => c.fn === "drawArraysInstanced");
    expect(drawCalls).toHaveLength(1);
    expect(drawCalls[0]?.args).toEqual([gl.TRIANGLES, 0, 6, 2]);
  });
});

describe("WeatherPass — no-op cases", () => {
  it("draws nothing when weatherKind is 'none'", () => {
    const { ctx, gl } = makeCtx();
    const pass = new WeatherPass(ctx);
    const weather = { weatherKind: "none", count: 0 } as unknown as RainField;
    pass.draw(ctx, VIEW, weather);
    expect(gl.calls.some((c) => c.fn === "drawArraysInstanced")).toBe(false);
  });

  it("draws nothing when target.isLost()", () => {
    const { ctx, gl } = makeCtx();
    const pass = new WeatherPass(ctx);
    vi.spyOn(ctx, "isLost").mockReturnValue(true);
    pass.draw(ctx, VIEW, makeRainWeather());
    expect(gl.calls.some((c) => c.fn === "drawArraysInstanced")).toBe(false);
  });
});

// ── The dual-path contract (acceptance criterion) ───────────────────────────
//
// WebGpuRenderer's real branch (../webgpu/renderer.ts endFrame, lines ~520-554)
// is, verbatim:
//
//   if (this.useGpuEffects) {
//     ...
//     if (weather instanceof RainField && weather.count > 0) {
//       this._weatherPass.draw(pass, weather);
//     }
//   }
//   ...
//   if (!this.useGpuEffects || (weather && !(weather instanceof RainField) && weather.count > 0)) {
//     ...
//     if (!this.useGpuEffects) { ... weather.draw(overlayCtx); }
//     else if (weather && weather.count > 0) { weather.draw(overlayCtx); }
//   }
//
// i.e. with useGpuEffects === true, a weather object only reaches the GPU pass
// when it IS a RainField; any other WeatherLike (structurally {count, draw(ctx)})
// falls through to the CPU draw(ctx) path and the GPU pass is never touched. Brief
// 08 (WebGl2Renderer assembly, which owns renderer.ts) must reproduce this exact
// condition. This test reproduces the condition locally (this module cannot import
// or modify renderer.ts) against this pass's real `draw`, so a regression in either
// this class's usage contract or a future edit to this branch is caught in-lane.
describe("dual-path contract — instanceof RainField gates the GPU pass", () => {
  // Mirrors WebGpuRenderer.endFrame's real branch verbatim (see comment above).
  function routeWeather(
    useGpuEffects: boolean,
    weather: WeatherLike | undefined,
    gpuDraw: () => void,
    cpuDraw: (ctx: "overlay-ctx") => void,
  ): void {
    if (useGpuEffects) {
      if (weather instanceof RainField && weather.count > 0) {
        gpuDraw();
      }
    }
    if (!useGpuEffects || (weather !== undefined && !(weather instanceof RainField) && weather.count > 0)) {
      if (!useGpuEffects) {
        if (weather && weather.count > 0) cpuDraw("overlay-ctx");
      } else if (weather && weather.count > 0) {
        cpuDraw("overlay-ctx");
      }
    }
  }

  it("a RainField reaches this pass's GPU draw() and never the CPU draw(ctx), when useGpuEffects is true", () => {
    const { ctx, gl } = makeCtx();
    const pass = new WeatherPass(ctx);
    const rain = makeRealRainField("rain");
    const cpuDraw = vi.fn();

    routeWeather(true, rain, () => pass.draw(ctx, VIEW, rain), cpuDraw);

    expect(gl.calls.some((c) => c.fn === "drawArraysInstanced")).toBe(true);
    expect(cpuDraw).not.toHaveBeenCalled();
  });

  it("a non-RainField WeatherLike reaches ONLY the CPU draw(ctx) path — never this pass's GPU draw() — when useGpuEffects is true", () => {
    const { ctx, gl } = makeCtx();
    const pass = new WeatherPass(ctx);
    const cpuDrawSpy = vi.fn();
    const nonRainField: WeatherLike = {
      count: 3,
      draw: cpuDrawSpy,
    };

    routeWeather(true, nonRainField, () => pass.draw(ctx, VIEW, nonRainField as unknown as RainField), cpuDrawSpy);

    expect(cpuDrawSpy).toHaveBeenCalledTimes(1);
    expect(cpuDrawSpy).toHaveBeenCalledWith("overlay-ctx");
    // The GPU pass must never have been touched for this non-RainField weather.
    expect(gl.calls.some((c) => c.fn === "drawArraysInstanced")).toBe(false);
    expect(gl.calls.some((c) => c.fn === "bufferSubData")).toBe(false);
  });

  it("with useGpuEffects false, even a RainField takes the CPU path and the GPU pass is untouched", () => {
    const { ctx, gl } = makeCtx();
    const pass = new WeatherPass(ctx);
    const rain = makeRealRainField("rain");
    const cpuDrawSpy = vi.fn();

    routeWeather(false, rain, () => pass.draw(ctx, VIEW, rain), cpuDrawSpy);

    expect(cpuDrawSpy).toHaveBeenCalledTimes(1);
    expect(gl.calls.some((c) => c.fn === "drawArraysInstanced")).toBe(false);
  });
});
