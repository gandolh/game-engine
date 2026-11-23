import { describe, expect, it, vi } from "vitest";
import type { LightOverlay, LightPool } from "../renderer";
import { LIGHT_FALLOFF_MID_AT, LIGHT_FALLOFF_MID_SHARE, OverlayLightPass, lightFalloff } from "./overlay-light-pass";

interface Call {
  op: string;
  args: unknown[];
}

function makeFakeGl(calls: Call[]): WebGL2RenderingContext {
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    DYNAMIC_DRAW: 6,
    FLOAT: 7,
    BLEND: 16,
    ONE: 17,
    TRIANGLES: 18,

    createShader: vi.fn(() => ({ __kind: "shader" })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({ __kind: "program" })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    deleteProgram: vi.fn(),
    getUniformLocation: vi.fn((_p: unknown, name: string) => ({ __uniform: name })),
    createVertexArray: vi.fn(() => ({ __kind: "vao" })),
    bindVertexArray: vi.fn(record("bindVertexArray")),
    createBuffer: vi.fn(() => ({ __kind: "buffer" })),
    deleteBuffer: vi.fn(record("deleteBuffer")),
    bindBuffer: vi.fn(record("bindBuffer")),
    bufferData: vi.fn(record("bufferData")),
    bufferSubData: vi.fn(record("bufferSubData")),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    vertexAttribDivisor: vi.fn(),
    useProgram: vi.fn(record("useProgram")),
    uniform2f: vi.fn(record("uniform2f")),
    enable: vi.fn(record("enable")),
    blendFunc: vi.fn(record("blendFunc")),
    drawArraysInstanced: vi.fn(record("drawArraysInstanced")),
    // A texture call here would be the bug this brief removed.
    texImage2D: vi.fn(record("texImage2D")),
    createTexture: vi.fn(record("createTexture")),
  };
  return gl as unknown as WebGL2RenderingContext;
}

const pool = (cx: number, peak: number): LightPool => ({ cx, cy: 5, radius: 40, r: 1, g: 0.5, b: 0.25, peak });
const VIEW = { sx: 2, sy: 2, ox: 10, oy: 20 };

describe("lightFalloff", () => {
  it("matches the three stops at 0, 0.45 and 1 of the radius", () => {
    expect(lightFalloff(0)).toBe(1);
    expect(lightFalloff(0.45)).toBeCloseTo(0.4, 12);
    expect(lightFalloff(1)).toBe(0);
    expect(LIGHT_FALLOFF_MID_AT).toBe(0.45);
    expect(LIGHT_FALLOFF_MID_SHARE).toBe(0.4);
  });

  it("is linear between the stops and never rises", () => {
    expect(lightFalloff(0.225)).toBeCloseTo(0.7, 12);
    expect(lightFalloff(0.725)).toBeCloseTo(0.2, 12);
    let prev = lightFalloff(0);
    for (let t = 0.01; t <= 1.2; t += 0.01) {
      const v = lightFalloff(t);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
  });
});

describe("OverlayLightPass", () => {
  it("is a no-op with no overlay or no pools", () => {
    const calls: Call[] = [];
    const pass = new OverlayLightPass(makeFakeGl(calls));
    pass.draw(undefined, VIEW, 800, 600);
    pass.draw({ pools: [pool(1, 1)], count: 0 }, VIEW, 800, 600);
    expect(calls.some((c) => c.op === "drawArraysInstanced" || c.op === "useProgram")).toBe(false);
  });

  it("draws all pools in one additive instanced call and uploads no texture", () => {
    const calls: Call[] = [];
    const gl = makeFakeGl(calls);
    const pass = new OverlayLightPass(gl);
    const overlay: LightOverlay = { pools: [pool(1, 0.5), pool(2, 0.25), pool(3, 0.1)], count: 3 };
    pass.draw(overlay, VIEW, 800, 600);

    expect(calls.some((c) => c.op === "blendFunc" && c.args[0] === gl.ONE && c.args[1] === gl.ONE)).toBe(true);
    const draws = calls.filter((c) => c.op === "drawArraysInstanced");
    expect(draws).toHaveLength(1);
    expect(draws[0]?.args).toEqual([gl.TRIANGLES, 0, 6, 3]);
    expect(calls.some((c) => c.op === "texImage2D" || c.op === "createTexture")).toBe(false);

    const data = calls.find((c) => c.op === "bufferSubData")?.args[2] as Float32Array;
    expect(Array.from(data.subarray(0, 8))).toEqual([1, 5, 40, 0.5, 1, 0.5, 0.25, 0]);
    expect(Array.from(data.subarray(8, 12))).toEqual([2, 5, 40, 0.25]);
  });

  it("maps the screen-pixel view to clip space", () => {
    const calls: Call[] = [];
    const pass = new OverlayLightPass(makeFakeGl(calls));
    pass.draw({ pools: [pool(1, 1)], count: 1 }, VIEW, 800, 600);
    const u = calls.filter((c) => c.op === "uniform2f").map((c) => c.args.slice(1));
    expect(u[0]).toEqual([(2 * 2) / 800, (-2 * 2) / 600]);
    expect(u[1]?.[0]).toBeCloseTo((10 * 2) / 800 - 1, 12);
    expect(u[1]?.[1]).toBeCloseTo(1 - (20 * 2) / 600, 12);
    expect(u[2]).toEqual([0.45, 0.4]);
  });

  it("reuses its staging array across frames and grows the buffer only when needed", () => {
    const calls: Call[] = [];
    const pass = new OverlayLightPass(makeFakeGl(calls));
    const pools = Array.from({ length: 100 }, (_, i) => pool(i, 1));
    pass.draw({ pools, count: 10 }, VIEW, 800, 600);
    pass.draw({ pools, count: 10 }, VIEW, 800, 600);
    expect(calls.filter((c) => c.op === "deleteBuffer")).toHaveLength(0);
    const uploads = calls.filter((c) => c.op === "bufferSubData").map((c) => c.args[2]);
    const [first, second] = uploads;
    expect(second).toBe(first);
    pass.draw({ pools, count: 100 }, VIEW, 800, 600);
    expect(calls.filter((c) => c.op === "deleteBuffer")).toHaveLength(1);
  });
});
