import { describe, it, expect, vi } from "vitest";
import {
  compileProgram,
  uniformLocations,
  setupAttrib,
  createVao,
  type AttribSpec,
} from "./program";

// node's vitest env has no real WebGL2. Per the project convention (see
// ../webgpu/renderer.test.ts's fake device/canvas), compileProgram is
// exercised against a mock GL object rather than a real context.
//
// GL constant values below don't need to match the spec's actual numeric
// values — the fake object treats them as opaque tokens, and compileProgram
// never inspects their numeric identity, only equality with gl.VERTEX_SHADER
// etc. which the fake also defines.

interface FakeShader {
  __kind: "shader";
  type: number;
  source: string;
  compiled: boolean;
  deleted: boolean;
}
interface FakeProgram {
  __kind: "program";
  shaders: FakeShader[];
  linked: boolean;
  deleted: boolean;
}

function makeFakeGl(opts: {
  shaderCompiles: (source: string, type: number) => boolean;
  programLinks: boolean;
  shaderLog?: string;
  programLog?: string;
}): WebGL2RenderingContext {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    FLOAT: 5,
    ARRAY_BUFFER: 6,

    createShader: vi.fn((type: number): FakeShader => ({
      __kind: "shader",
      type,
      source: "",
      compiled: false,
      deleted: false,
    })),
    shaderSource: vi.fn((shader: FakeShader, source: string): void => {
      shader.source = source;
    }),
    compileShader: vi.fn((shader: FakeShader): void => {
      shader.compiled = opts.shaderCompiles(shader.source, shader.type);
    }),
    getShaderParameter: vi.fn((shader: FakeShader, _pname: number): boolean => shader.compiled),
    getShaderInfoLog: vi.fn((_shader: FakeShader): string => opts.shaderLog ?? ""),
    deleteShader: vi.fn((shader: FakeShader): void => {
      shader.deleted = true;
    }),

    createProgram: vi.fn((): FakeProgram => ({ __kind: "program", shaders: [], linked: false, deleted: false })),
    attachShader: vi.fn((program: FakeProgram, shader: FakeShader): void => {
      program.shaders.push(shader);
    }),
    linkProgram: vi.fn((program: FakeProgram): void => {
      program.linked = opts.programLinks;
    }),
    getProgramParameter: vi.fn((program: FakeProgram, _pname: number): boolean => program.linked),
    getProgramInfoLog: vi.fn((_program: FakeProgram): string => opts.programLog ?? ""),
    deleteProgram: vi.fn((program: FakeProgram): void => {
      program.deleted = true;
    }),

    getUniformLocation: vi.fn((_program: FakeProgram, name: string) => ({ __uniform: name })),

    createVertexArray: vi.fn(() => ({ __kind: "vao" })),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    vertexAttribDivisor: vi.fn(),
  };

  return gl as unknown as WebGL2RenderingContext;
}

const VERT = "#version 300 es\nvoid main() { gl_Position = vec4(0.0); }\n";
const FRAG = "#version 300 es\nprecision mediump float;\nout vec4 o;\nvoid main() { o = vec4(1.0); }\n";

describe("compileProgram", () => {
  it("returns a linked program on the happy path", () => {
    const gl = makeFakeGl({ shaderCompiles: () => true, programLinks: true });
    const program = compileProgram(gl, VERT, FRAG, "blit");
    expect(program).toBeTruthy();
    expect((gl.linkProgram as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("throws with the info log and line-numbered source when a shader fails to compile", () => {
    const gl = makeFakeGl({
      shaderCompiles: (source) => !source.includes("void main() { gl_Position"), // fail the vertex shader
      programLinks: true,
      shaderLog: "ERROR: 0:2: 'foo' : undeclared identifier",
    });

    let thrown: unknown;
    try {
      compileProgram(gl, VERT, FRAG, "blit");
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("blit");
    expect(message).toContain("vertex");
    expect(message).toContain("undeclared identifier");
    // Line-numbered source: line 1 of VERT prefixed with "   1 | ".
    expect(message).toContain("1 | #version 300 es");
    expect(message).toContain("2 | void main()");
  });

  it("throws with the program info log when linking fails", () => {
    const gl = makeFakeGl({
      shaderCompiles: () => true,
      programLinks: false,
      programLog: "ERROR: could not link — varying mismatch",
    });

    expect(() => compileProgram(gl, VERT, FRAG, "blit")).toThrow(/varying mismatch/);
    expect(() => compileProgram(gl, VERT, FRAG, "blit")).toThrow(/blit/);
  });
});

describe("uniformLocations", () => {
  it("caches a location per name in one pass", () => {
    const gl = makeFakeGl({ shaderCompiles: () => true, programLinks: true });
    const program = compileProgram(gl, VERT, FRAG, "blit");
    const locations = uniformLocations(gl, program, ["u_tex", "u_view"] as const);

    expect(gl.getUniformLocation).toHaveBeenCalledTimes(2);
    expect(locations.u_tex).toEqual({ __uniform: "u_tex" });
    expect(locations.u_view).toEqual({ __uniform: "u_view" });
  });
});

describe("createVao / setupAttrib", () => {
  it("binds the vao, runs setup, and unbinds", () => {
    const gl = makeFakeGl({ shaderCompiles: () => true, programLinks: true });
    const calls: string[] = [];
    (gl.bindVertexArray as ReturnType<typeof vi.fn>).mockImplementation((v: unknown) => {
      calls.push(v === null ? "unbind" : "bind");
    });

    const spec: AttribSpec = { location: 0, size: 2, type: gl.FLOAT, stride: 16, offset: 0 };
    const vao = createVao(gl, (g) => {
      setupAttrib(g, spec);
    });

    expect(vao).toBeTruthy();
    expect(calls).toEqual(["bind", "unbind"]);
    expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(0);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(0, 2, gl.FLOAT, false, 16, 0);
    expect(gl.vertexAttribDivisor).not.toHaveBeenCalled();
  });

  it("sets the divisor for an instanced attribute", () => {
    const gl = makeFakeGl({ shaderCompiles: () => true, programLinks: true });
    createVao(gl, (g) => {
      setupAttrib(g, { location: 2, size: 4, type: gl.FLOAT, stride: 32, offset: 0, divisor: 1 });
    });

    expect(gl.vertexAttribDivisor).toHaveBeenCalledWith(2, 1);
  });
});
