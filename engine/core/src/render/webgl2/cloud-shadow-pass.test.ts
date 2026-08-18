import { describe, it, expect, vi } from "vitest";
import { EDG } from "../palette";
import { CloudShadowPass } from "./cloud-shadow-pass";

// node's vitest env has no real WebGL2. Per this project's convention (see
// ./program.test.ts's fake GL and ../webgpu/cloud-shadow-pass.test.ts's fake
// device), CloudShadowPass is exercised against a mock GL object rather than
// a real context.

interface FakeShader {
  __kind: "shader";
  compiled: boolean;
}
interface FakeProgram {
  __kind: "program";
  linked: boolean;
}

function makeFakeGl(): WebGL2RenderingContext {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TRIANGLES: 5,
    BLEND: 6,
    FUNC_ADD: 7,
    ONE: 8,
    ONE_MINUS_SRC_ALPHA: 9,

    createShader: vi.fn((): FakeShader => ({ __kind: "shader", compiled: false })),
    shaderSource: vi.fn(),
    compileShader: vi.fn((shader: FakeShader): void => {
      shader.compiled = true;
    }),
    getShaderParameter: vi.fn((shader: FakeShader): boolean => shader.compiled),
    getShaderInfoLog: vi.fn((): string => ""),
    deleteShader: vi.fn(),

    createProgram: vi.fn((): FakeProgram => ({ __kind: "program", linked: false })),
    attachShader: vi.fn(),
    linkProgram: vi.fn((program: FakeProgram): void => {
      program.linked = true;
    }),
    getProgramParameter: vi.fn((program: FakeProgram): boolean => program.linked),
    getProgramInfoLog: vi.fn((): string => ""),
    deleteProgram: vi.fn(),

    getUniformLocation: vi.fn((_program: FakeProgram, name: string) => ({ __uniform: name })),

    createVertexArray: vi.fn(() => ({ __kind: "vao" })),
    bindVertexArray: vi.fn(),

    useProgram: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    enable: vi.fn(),
    blendEquationSeparate: vi.fn(),
    blendFuncSeparate: vi.fn(),
    drawArrays: vi.fn(),
  };

  return gl as unknown as WebGL2RenderingContext;
}

const BASE_OPTS = { color: EDG.black, coverage: 0.5, driftSpeed: 1, timeSec: 0 };

describe("CloudShadowPass", () => {
  it("compiles the program once (in the constructor), not once per draw()", () => {
    const gl = makeFakeGl();
    const pass = new CloudShadowPass(gl);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.linkProgram).toHaveBeenCalledTimes(1);

    pass.setView({ scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0 });
    pass.draw(gl, BASE_OPTS);
    pass.draw(gl, BASE_OPTS);
    pass.draw(gl, BASE_OPTS);

    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.linkProgram).toHaveBeenCalledTimes(1);
    expect(gl.drawArrays).toHaveBeenCalledTimes(3);
  });

  it("draws a single fullscreen triangle (no vertex buffer)", () => {
    const gl = makeFakeGl();
    const pass = new CloudShadowPass(gl);
    pass.setView({ scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0 });
    pass.draw(gl, BASE_OPTS);

    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
    expect(gl.bindVertexArray).toHaveBeenCalled();
    expect(gl.useProgram).toHaveBeenCalled();
  });

  it("skips the draw entirely when coverage <= 0.001", () => {
    const gl = makeFakeGl();
    const pass = new CloudShadowPass(gl);
    pass.setView({ scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0 });

    pass.draw(gl, { ...BASE_OPTS, coverage: 0.001 });
    pass.draw(gl, { ...BASE_OPTS, coverage: 0 });

    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(gl.useProgram).not.toHaveBeenCalled();
  });

  it("packs mode as a 0/1 float uniform (shadow=0, haze=1)", () => {
    const gl = makeFakeGl();
    const pass = new CloudShadowPass(gl);
    pass.setView({ scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0 });

    pass.draw(gl, { ...BASE_OPTS, mode: "shadow" });
    const shadowCall = (gl.uniform1f as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0]?.__uniform === "u_mode",
    );
    expect(shadowCall?.[1]).toBe(0);

    (gl.uniform1f as ReturnType<typeof vi.fn>).mockClear();
    pass.draw(gl, { ...BASE_OPTS, mode: "haze" });
    const hazeCall = (gl.uniform1f as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0]?.__uniform === "u_mode",
    );
    expect(hazeCall?.[1]).toBe(1);
  });

  it("clamps vignette to [0,1] and defaults it to 0 when omitted", () => {
    const gl = makeFakeGl();
    const pass = new CloudShadowPass(gl);
    pass.setView({ scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0 });

    pass.draw(gl, { ...BASE_OPTS, vignette: 5 });
    let call = (gl.uniform1f as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0]?.__uniform === "u_vignette",
    );
    expect(call?.[1]).toBe(1);

    (gl.uniform1f as ReturnType<typeof vi.fn>).mockClear();
    pass.draw(gl, BASE_OPTS);
    call = (gl.uniform1f as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0]?.__uniform === "u_vignette",
    );
    expect(call?.[1]).toBe(0);
  });

  it("sets the view scale/offset uniforms from setView, not recomputed per draw", () => {
    const gl = makeFakeGl();
    const pass = new CloudShadowPass(gl);
    pass.setView({ scaleX: 2, scaleY: -3, offsetX: 4, offsetY: 5 });
    pass.draw(gl, BASE_OPTS);

    expect(gl.uniform2f).toHaveBeenCalledWith(
      expect.objectContaining({ __uniform: "u_scale" }),
      2,
      -3,
    );
    expect(gl.uniform2f).toHaveBeenCalledWith(
      expect.objectContaining({ __uniform: "u_offset" }),
      4,
      5,
    );
  });
});
