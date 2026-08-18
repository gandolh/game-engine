import { describe, it, expect, vi } from "vitest";
import { createGlDevice3d, GlDevice3d } from "./device3d";

// node's vitest env has no real WebGL2 / DOM. Follows the stub style of
// ../../render/webgl2/gl-context.test.ts's FakeCanvas/FakeGl, extended with
// `enable`/`getParameter` since GlDevice3d.create() calls those directly
// (DEPTH_TEST/CULL_FACE enable + the MAX_UNIFORM_BLOCK_SIZE query).
//
// Real browsers return the SAME context object from every `getContext`
// call for a given (canvas, type) pair regardless of the attrs passed on
// later calls — this fake mirrors that by always returning `_gl` for
// "webgl2", independent of which attributes object was passed, which is
// exactly the behavior `device3d.ts`'s pre-warm trick relies on.

interface FakeGl {
  enableCalls: number[];
  DEPTH_TEST: number;
  CULL_FACE: number;
  MAX_UNIFORM_BLOCK_SIZE: number;
  enable: (cap: number) => void;
  getParameter: (pname: number) => unknown;
  getExtension: (name: string) => unknown;
}

function makeFakeGl(maxUniformBlockSize = 65536): FakeGl {
  const gl: FakeGl = {
    enableCalls: [],
    DEPTH_TEST: 2929,
    CULL_FACE: 2884,
    MAX_UNIFORM_BLOCK_SIZE: 35376,
    enable: (cap) => {
      gl.enableCalls.push(cap);
    },
    getParameter: (pname) => (pname === gl.MAX_UNIFORM_BLOCK_SIZE ? maxUniformBlockSize : null),
    getExtension: vi.fn(() => null),
  };
  return gl;
}

class FakeCanvas {
  width = 0;
  height = 0;
  private readonly _listeners = new Map<string, Set<(ev: unknown) => void>>();
  private readonly _gl: FakeGl | null;

  constructor(gl: FakeGl | null) {
    this._gl = gl;
  }

  getContext(type: string): unknown {
    if (type !== "webgl2") return null;
    return this._gl;
  }

  addEventListener(type: string, handler: (ev: unknown) => void): void {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(handler);
  }

  removeEventListener(type: string, handler: (ev: unknown) => void): void {
    this._listeners.get(type)?.delete(handler);
  }

  listenerCount(type: string): number {
    return this._listeners.get(type)?.size ?? 0;
  }
}

describe("createGlDevice3d", () => {
  it("throws a clear, catchable error when webgl2 is unavailable", () => {
    const canvas = new FakeCanvas(null);
    expect(() => createGlDevice3d(canvas as unknown as HTMLCanvasElement)).toThrow(/render3d/i);
    expect(() => createGlDevice3d(canvas as unknown as HTMLCanvasElement)).toThrow(
      /webgl2 context unavailable/i,
    );
  });

  it("creates a GlDevice3d, enabling depth test + cull face, on success", () => {
    const gl = makeFakeGl();
    const canvas = new FakeCanvas(gl);

    const device3d = createGlDevice3d(canvas as unknown as HTMLCanvasElement);

    expect(device3d).toBeInstanceOf(GlDevice3d);
    expect(device3d.gl).toBe(gl);
    expect(device3d.canvas).toBe(canvas);
    expect(device3d.lost).toBe(false);
    expect(gl.enableCalls).toContain(gl.DEPTH_TEST);
    expect(gl.enableCalls).toContain(gl.CULL_FACE);
  });

  it("queries and exposes MAX_UNIFORM_BLOCK_SIZE at creation", () => {
    const gl = makeFakeGl(16384);
    const canvas = new FakeCanvas(gl);

    const device3d = createGlDevice3d(canvas as unknown as HTMLCanvasElement);

    expect(device3d.maxUniformBlockSize).toBe(16384);
  });

  it("pre-warms the context before createGlContext's own getContext call (registers loss/restore listeners exactly once)", () => {
    const gl = makeFakeGl();
    const canvas = new FakeCanvas(gl);

    createGlDevice3d(canvas as unknown as HTMLCanvasElement);

    // If the pre-warm call and createGlContext's internal call produced two
    // different GlContext wrappers around two different underlying
    // contexts, listeners would be registered twice per event. Exactly one
    // GlContext was constructed, so exactly one pair of listeners exists.
    expect(canvas.listenerCount("webglcontextlost")).toBe(1);
    expect(canvas.listenerCount("webglcontextrestored")).toBe(1);
  });

  it("exposes the underlying GlContext as an escape hatch (isLost reflects context loss)", () => {
    const gl = makeFakeGl();
    const canvas = new FakeCanvas(gl);

    const device3d = createGlDevice3d(canvas as unknown as HTMLCanvasElement);
    expect(device3d.glContext.isLost()).toBe(false);
  });
});
