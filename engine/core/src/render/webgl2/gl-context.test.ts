import { describe, it, expect, vi } from "vitest";
import { createGlContext, GlContext } from "./gl-context";

// node's vitest env has no real WebGL2 / DOM. Following the project pattern
// (../webgpu/renderer.test.ts's FakeCanvasElement), this stubs just the
// canvas + fake GL surface GlContext touches: getContext, addEventListener/
// removeEventListener for the loss/restore events, and viewport/getExtension.

interface FakeGl {
  viewportCalls: Array<[number, number, number, number]>;
  viewport: (x: number, y: number, w: number, h: number) => void;
  getExtension: (name: string) => unknown;
}

function makeFakeGl(): FakeGl {
  const gl: FakeGl = {
    viewportCalls: [],
    viewport: (x, y, w, h) => {
      gl.viewportCalls.push([x, y, w, h]);
    },
    getExtension: vi.fn(() => null),
  };
  return gl;
}

class FakeCanvas {
  width = 0;
  height = 0;
  private readonly _listeners = new Map<string, Set<(ev: unknown) => void>>();
  private readonly _gl: FakeGl;
  private _returnNullContext: boolean;

  constructor(gl: FakeGl, returnNullContext = false) {
    this._gl = gl;
    this._returnNullContext = returnNullContext;
  }

  getContext(type: string): unknown {
    if (type !== "webgl2") return null;
    return this._returnNullContext ? null : this._gl;
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

  dispatch(type: string, ev: unknown): void {
    for (const handler of this._listeners.get(type) ?? []) handler(ev);
  }

  listenerCount(type: string): number {
    return this._listeners.get(type)?.size ?? 0;
  }
}

describe("createGlContext", () => {
  it("throws 'webgl2: context unavailable' when getContext returns null", () => {
    const canvas = new FakeCanvas(makeFakeGl(), true);
    expect(() => createGlContext(canvas as unknown as HTMLCanvasElement)).toThrow(
      "webgl2: context unavailable",
    );
  });

  it("returns a GlContext wrapping the real context on success", () => {
    const gl = makeFakeGl();
    const canvas = new FakeCanvas(gl);
    const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);
    expect(ctx).toBeInstanceOf(GlContext);
    expect(ctx.gl).toBe(gl);
    expect(ctx.isLost()).toBe(false);
  });
});

describe("GlContext#resize", () => {
  it("scales CSS pixels by devicePixelRatio (clamped to 2) and sets canvas + viewport", () => {
    const originalDpr = (globalThis as { window?: { devicePixelRatio?: number } }).window
      ?.devicePixelRatio;
    (globalThis as unknown as { window: { devicePixelRatio: number } }).window = {
      devicePixelRatio: 3, // above the MAX_DPR=2 clamp
    };

    const gl = makeFakeGl();
    const canvas = new FakeCanvas(gl);
    const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);

    ctx.resize(100, 50);

    expect(canvas.width).toBe(200); // 100 * clamp(3, 2) = 200
    expect(canvas.height).toBe(100);
    expect(gl.viewportCalls).toEqual([[0, 0, 200, 100]]);

    if (originalDpr === undefined) {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("is a no-op on canvas dimensions when the size does not change, but still re-issues viewport", () => {
    (globalThis as unknown as { window: { devicePixelRatio: number } }).window = {
      devicePixelRatio: 1,
    };
    const gl = makeFakeGl();
    const canvas = new FakeCanvas(gl);
    const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);

    ctx.resize(100, 50);
    ctx.resize(100, 50);

    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
    expect(gl.viewportCalls.length).toBe(2);

    delete (globalThis as { window?: unknown }).window;
  });
});

describe("GlContext context loss/restore", () => {
  it("registers webglcontextlost/webglcontextrestored listeners on construction", () => {
    const canvas = new FakeCanvas(makeFakeGl());
    createGlContext(canvas as unknown as HTMLCanvasElement);
    expect(canvas.listenerCount("webglcontextlost")).toBe(1);
    expect(canvas.listenerCount("webglcontextrestored")).toBe(1);
  });

  it("calls preventDefault, flips isLost(), and notifies onContextLost handlers", () => {
    const canvas = new FakeCanvas(makeFakeGl());
    const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);

    const handler = vi.fn();
    ctx.onContextLost(handler);

    const preventDefault = vi.fn();
    canvas.dispatch("webglcontextlost", { preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(ctx.isLost()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("flips isLost() back and notifies onContextRestored handlers on restore", () => {
    const canvas = new FakeCanvas(makeFakeGl());
    const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);

    const restoredHandler = vi.fn();
    ctx.onContextRestored(restoredHandler);

    canvas.dispatch("webglcontextlost", { preventDefault: vi.fn() });
    expect(ctx.isLost()).toBe(true);

    canvas.dispatch("webglcontextrestored", {});
    expect(ctx.isLost()).toBe(false);
    expect(restoredHandler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe functions stop further notifications", () => {
    const canvas = new FakeCanvas(makeFakeGl());
    const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);

    const handler = vi.fn();
    const unsubscribe = ctx.onContextLost(handler);
    unsubscribe();

    canvas.dispatch("webglcontextlost", { preventDefault: vi.fn() });
    expect(handler).not.toHaveBeenCalled();
  });

  it("skips gl.viewport while lost", () => {
    const gl = makeFakeGl();
    const canvas = new FakeCanvas(gl);
    const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);

    canvas.dispatch("webglcontextlost", { preventDefault: vi.fn() });
    ctx.resize(10, 10);

    expect(gl.viewportCalls).toEqual([]);
    // Canvas backing-store dimensions still track CSS size even while lost.
    expect(canvas.width).toBe(10);
    expect(canvas.height).toBe(10);
  });
});

describe("GlContext#dispose", () => {
  it("removes listeners and calls WEBGL_lose_context.loseContext() if available", () => {
    const loseContext = vi.fn();
    const gl = makeFakeGl();
    (gl.getExtension as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      name === "WEBGL_lose_context" ? { loseContext } : null,
    );
    const canvas = new FakeCanvas(gl);
    const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);

    ctx.dispose();

    expect(loseContext).toHaveBeenCalled();
    expect(canvas.listenerCount("webglcontextlost")).toBe(0);
    expect(canvas.listenerCount("webglcontextrestored")).toBe(0);
  });

  it("does not throw when WEBGL_lose_context is unavailable", () => {
    const canvas = new FakeCanvas(makeFakeGl());
    const ctx = createGlContext(canvas as unknown as HTMLCanvasElement);
    expect(() => ctx.dispose()).not.toThrow();
  });
});
