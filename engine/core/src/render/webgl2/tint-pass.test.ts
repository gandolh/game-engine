import { describe, it, expect, vi } from "vitest";
import { EDG } from "../palette";

// Port of ../webgpu/tint-pass.test.ts for the WebGL2 backend. node's vitest env has no
// real WebGL2, so exercise TintPass against a mock GL object — same convention as
// ../webgl2/program.test.ts's fake GL.

interface FakeShader { __kind: "shader"; type: number; source: string; compiled: boolean }
interface FakeProgram { __kind: "program"; linked: boolean }

function makeFakeGl(): {
  gl: WebGL2RenderingContext;
  createVertexArray: ReturnType<typeof vi.fn>;
  useProgram: ReturnType<typeof vi.fn>;
  bindVertexArray: ReturnType<typeof vi.fn>;
  uniform3f: ReturnType<typeof vi.fn>;
  uniform1f: ReturnType<typeof vi.fn>;
  drawArrays: ReturnType<typeof vi.fn>;
  blendFunc: ReturnType<typeof vi.fn>;
  createShader: ReturnType<typeof vi.fn>;
  createProgram: ReturnType<typeof vi.fn>;
} {
  const createShader = vi.fn((type: number): FakeShader => ({
    __kind: "shader", type, source: "", compiled: true,
  }));
  const createProgram = vi.fn((): FakeProgram => ({ __kind: "program", linked: true }));
  const createVertexArray = vi.fn(() => ({ __kind: "vao" }));
  const useProgram = vi.fn();
  const bindVertexArray = vi.fn();
  const uniform3f = vi.fn();
  const uniform1f = vi.fn();
  const drawArrays = vi.fn();
  const blendFunc = vi.fn();

  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TRIANGLES: 5,
    BLEND: 6,
    ONE: 7,
    ONE_MINUS_SRC_ALPHA: 8,

    createShader,
    shaderSource: vi.fn((s: FakeShader, src: string) => { s.source = src; }),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn((s: FakeShader) => s.compiled),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),

    createProgram,
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((p: FakeProgram) => p.linked),
    getProgramInfoLog: vi.fn(() => ""),
    deleteProgram: vi.fn(),

    getUniformLocation: vi.fn((_p: FakeProgram, name: string) => ({ __uniform: name })),

    createVertexArray,
    bindVertexArray,
    useProgram,
    uniform3f,
    uniform1f,
    enable: vi.fn(),
    blendFunc,
    drawArrays,
  };

  return {
    gl: gl as unknown as WebGL2RenderingContext,
    createVertexArray, useProgram, bindVertexArray, uniform3f, uniform1f, drawArrays, blendFunc,
    createShader, createProgram,
  };
}

describe("TintPass", () => {
  it("compiles the program once (in the constructor), not once per draw()", async () => {
    const { gl, createShader, createProgram } = makeFakeGl();
    const { TintPass } = await import("./tint-pass");
    const pass = new TintPass(gl);
    expect(createProgram).toHaveBeenCalledTimes(1);
    expect(createShader).toHaveBeenCalledTimes(2); // vertex + fragment

    pass.draw(EDG.black, 0.5);
    pass.draw(EDG.black, 0.3);
    pass.draw(EDG.black, 0.1);

    expect(createProgram).toHaveBeenCalledTimes(1);
    expect(createShader).toHaveBeenCalledTimes(2);
  });

  it("resolves the EDG hex colour through rgbOf and uploads it as a normalized uniform", async () => {
    const { gl, uniform3f, uniform1f } = makeFakeGl();
    const { TintPass } = await import("./tint-pass");
    const pass = new TintPass(gl);

    pass.draw(EDG.white, 0.75);

    expect(uniform3f).toHaveBeenCalledWith(expect.anything(), 1, 1, 1);
    expect(uniform1f).toHaveBeenCalledWith(expect.anything(), 0.75);
  });

  it("draws a 3-vertex full-screen triangle with the tint blend state, once per draw() call", async () => {
    const { gl, drawArrays, blendFunc, bindVertexArray } = makeFakeGl();
    const { TintPass } = await import("./tint-pass");
    const pass = new TintPass(gl);

    pass.draw(EDG.black, 0.5);
    pass.draw(EDG.black, 0.5);

    expect(drawArrays).toHaveBeenCalledTimes(2);
    expect(drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
    // Premultiplied source-over: (ONE, ONE_MINUS_SRC_ALPHA), matching the WGSL blend state.
    expect(blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Bound before drawing, unbound after (mirrors createVao's bind/unbind discipline).
    expect(bindVertexArray).toHaveBeenNthCalledWith(1, expect.anything());
    expect(bindVertexArray).toHaveBeenLastCalledWith(null);
  });
});
