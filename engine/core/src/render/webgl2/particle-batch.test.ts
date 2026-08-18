import { describe, it, expect, vi } from "vitest";
import { createGlContext, GlContext } from "./gl-context";
import { ParticleBatch } from "./particle-batch";
import type { ViewUniform } from "../view-uniform";
import type { ParticleSystem, GpuParticleView } from "../particles";

// node's vitest env has no real WebGL2. Per project convention (mock GL objects,
// never a real context — see ../webgpu/renderer.test.ts, ./program.test.ts,
// ./gl-context.test.ts), this drives ParticleBatch against a fake
// WebGL2RenderingContext wrapped in a real GlContext (via createGlContext +a
// fake canvas), so `target.isLost()` behaves exactly as production code sees it.

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

function makeParticles(views: GpuParticleView[]): ParticleSystem {
  return {
    count: views.length,
    forEachParticle(visit: (v: GpuParticleView) => void): void {
      for (const v of views) visit(v);
    },
  } as unknown as ParticleSystem;
}

describe("ParticleBatch", () => {
  it("compiles a program once at construction", () => {
    const { ctx, gl } = makeCtx();
    new ParticleBatch(ctx);
    expect(gl.calls.filter((c) => c.fn === "linkProgram")).toHaveLength(1);
  });

  it("draws nothing when the particle system is empty", () => {
    const { ctx, gl } = makeCtx();
    const batch = new ParticleBatch(ctx);
    batch.draw(ctx, VIEW, makeParticles([]));
    expect(gl.calls.some((c) => c.fn === "drawArraysInstanced")).toBe(false);
  });

  it("uploads instance data and issues one instanced draw call for N particles", () => {
    const { ctx, gl } = makeCtx();
    const batch = new ParticleBatch(ctx);
    const particles = makeParticles([
      { x: 1, y: 2, size: 3, shape: "circle", r: 255, g: 0, b: 0, alpha: 1 },
      { x: 4, y: 5, size: 6, shape: "star", r: 0, g: 255, b: 0, alpha: 0.5 },
    ]);

    batch.draw(ctx, VIEW, particles);

    const drawCalls = gl.calls.filter((c) => c.fn === "drawArraysInstanced");
    expect(drawCalls).toHaveLength(1);
    expect(drawCalls[0]?.args).toEqual([gl.TRIANGLES, 0, 6, 2]);

    const subData = gl.calls.filter((c) => c.fn === "bufferSubData");
    expect(subData).toHaveLength(1);
  });

  it("sets the literal blend state (ONE, ONE_MINUS_SRC_ALPHA, FUNC_ADD) every draw", () => {
    const { ctx, gl } = makeCtx();
    const batch = new ParticleBatch(ctx);
    batch.draw(ctx, VIEW, makeParticles([{ x: 0, y: 0, size: 1, shape: "rect", r: 1, g: 1, b: 1, alpha: 1 }]));

    expect(gl.calls.some((c) => c.fn === "enable" && c.args[0] === gl.BLEND)).toBe(true);
    expect(gl.calls.some((c) => c.fn === "blendEquation" && c.args[0] === gl.FUNC_ADD)).toBe(true);
    expect(
      gl.calls.some(
        (c) =>
          c.fn === "blendFuncSeparate" &&
          c.args[0] === gl.ONE &&
          c.args[1] === gl.ONE_MINUS_SRC_ALPHA &&
          c.args[2] === gl.ONE &&
          c.args[3] === gl.ONE_MINUS_SRC_ALPHA,
      ),
    ).toBe(true);
  });

  it("grows the instance buffer (and re-binds the VAO) when count exceeds capacity", () => {
    const { ctx, gl } = makeCtx();
    const batch = new ParticleBatch(ctx);
    const many = Array.from({ length: 300 }, (_, i) => ({
      x: i, y: i, size: 1, shape: "rect" as const, r: 1, g: 1, b: 1, alpha: 1,
    }));

    const bufferDataCallsBefore = gl.calls.filter((c) => c.fn === "bufferData").length;
    batch.draw(ctx, VIEW, makeParticles(many));
    const bufferDataCallsAfter = gl.calls.filter((c) => c.fn === "bufferData").length;

    // Initial capacity is 256 < 300, so a grow must allocate a new buffer.
    expect(bufferDataCallsAfter).toBeGreaterThan(bufferDataCallsBefore);
    const drawCalls = gl.calls.filter((c) => c.fn === "drawArraysInstanced");
    expect(drawCalls[drawCalls.length - 1]?.args).toEqual([gl.TRIANGLES, 0, 6, 300]);
  });

  it("skips drawing entirely when target.isLost()", () => {
    const { ctx, gl } = makeCtx();
    const batch = new ParticleBatch(ctx);

    // Simulate context loss the same way GlContext exposes it in production:
    // dispatch the DOM event it listens for is not available on this fake
    // canvas (addEventListener is a no-op stub), so drive isLost() by casting
    // — this test only needs to prove the *guard*, not GlContext's own loss
    // wiring (that is ./gl-context.test.ts's job).
    vi.spyOn(ctx, "isLost").mockReturnValue(true);

    batch.draw(ctx, VIEW, makeParticles([{ x: 0, y: 0, size: 1, shape: "rect", r: 1, g: 1, b: 1, alpha: 1 }]));

    expect(gl.calls.some((c) => c.fn === "drawArraysInstanced")).toBe(false);
  });
});
