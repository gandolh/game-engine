import { describe, it, expect, vi } from "vitest";
import { PipelineCache, type ShaderSource } from "./pipeline-cache";
import { FLOATS_PER_INSTANCE, FLOATS_PER_VERTEX } from "../buffers";

// node's vitest env has no real WebGL2. Per the project convention (see
// ../../render/webgl2/program.test.ts's fake), compileProgram's dependencies
// are stubbed with a mock GL that always reports success.

function makeFakeGl(): WebGL2RenderingContext {
  const gl = {
    FLOAT: 5126,
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,

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

    getUniformLocation: vi.fn((_program: unknown, name: string) => ({ __uniform: name })),
  };
  return gl as unknown as WebGL2RenderingContext;
}

const SOURCE: ShaderSource = {
  vert: "#version 300 es\nvoid main(){gl_Position=vec4(0.0);}",
  frag: "#version 300 es\nprecision mediump float;\nout vec4 o;\nvoid main(){o=vec4(1.0);}",
  uniformNames: ["u_viewProj", "u_time"],
};

describe("PipelineCache#getOrCreate", () => {
  it("builds a Pipeline3d with the compiled program, resolved uniforms, and the vertex/instance attribute layout", () => {
    const gl = makeFakeGl();
    const cache = new PipelineCache(gl);

    const pipeline = cache.getOrCreate(SOURCE);

    expect(pipeline.program).toBeTruthy();
    expect(pipeline.uniforms.u_viewProj).toEqual({ __uniform: "u_viewProj" });
    expect(pipeline.uniforms.u_time).toEqual({ __uniform: "u_time" });

    // Vertex layout: position.xyz (loc 0) + materialIndex (loc 1), matching
    // FLOATS_PER_VERTEX's 4-float row.
    expect(pipeline.vertexAttribs).toEqual([
      { location: 0, size: 3, type: gl.FLOAT, stride: FLOATS_PER_VERTEX * 4, offset: 0 },
      { location: 1, size: 1, type: gl.FLOAT, stride: FLOATS_PER_VERTEX * 4, offset: 12 },
    ]);

    // Instance layout: 4 model-matrix columns (loc 2..5) + tint (loc 6),
    // each per-instance (divisor 1), matching FLOATS_PER_INSTANCE's 20-float row.
    expect(pipeline.instanceAttribs.map((a) => a.location)).toEqual([2, 3, 4, 5, 6]);
    expect(pipeline.instanceAttribs.every((a) => a.divisor === 1)).toBe(true);
    expect(pipeline.instanceAttribs.every((a) => a.stride === FLOATS_PER_INSTANCE * 4)).toBe(true);
    expect(pipeline.instanceAttribs.map((a) => a.offset)).toEqual([0, 16, 32, 48, 64]);
  });

  it("memoizes by toonSteps — building only once for the same key", () => {
    const gl = makeFakeGl();
    const cache = new PipelineCache(gl);

    const a = cache.getOrCreate(SOURCE, 3);
    const b = cache.getOrCreate(SOURCE, 3);

    expect(a).toBe(b);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
  });

  it("uses the default toonSteps key when omitted, consistent with an explicit default", () => {
    const gl = makeFakeGl();
    const cache = new PipelineCache(gl);

    const a = cache.getOrCreate(SOURCE);
    const b = cache.getOrCreate(SOURCE, 3);

    expect(a).toBe(b);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
  });

  it("builds a separate program for a different toonSteps key", () => {
    const gl = makeFakeGl();
    const cache = new PipelineCache(gl);

    const a = cache.getOrCreate(SOURCE, 3);
    const b = cache.getOrCreate(SOURCE, 5);

    expect(a).not.toBe(b);
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
  });
});
