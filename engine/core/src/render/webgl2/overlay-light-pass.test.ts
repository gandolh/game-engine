import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx2D } from "../sprite-types";
import type { OverlayFn } from "../renderer";

// node's vitest env has no real WebGL2 or OffscreenCanvas. Following the project
// convention (../webgl2/program.test.ts's fake GL, ../ui-draw.test.ts's fake
// OffscreenCanvas), both are stubbed here.

interface FakeShader { __kind: "shader"; compiled: boolean }
interface FakeProgram { __kind: "program"; linked: boolean }

interface Call {
  op: string;
  args: unknown[];
}

function makeFakeGl(calls: Call[]): WebGL2RenderingContext {
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };

  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    TEXTURE_2D: 5, TEXTURE_MIN_FILTER: 6, TEXTURE_MAG_FILTER: 7, NEAREST: 8,
    TEXTURE_WRAP_S: 9, TEXTURE_WRAP_T: 10, CLAMP_TO_EDGE: 11,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 12, RGBA: 13, UNSIGNED_BYTE: 14,
    TEXTURE0: 15, BLEND: 16, ONE: 17, TRIANGLES: 18,

    createShader: vi.fn((): FakeShader => ({ __kind: "shader", compiled: true })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),

    createProgram: vi.fn((): FakeProgram => ({ __kind: "program", linked: true })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    deleteProgram: vi.fn(),

    getUniformLocation: vi.fn((_p: FakeProgram, name: string) => ({ __uniform: name })),

    createVertexArray: vi.fn(() => ({ __kind: "vao" })),
    bindVertexArray: vi.fn(record("bindVertexArray")),

    createTexture: vi.fn(() => ({ __kind: "texture" })),
    bindTexture: vi.fn(record("bindTexture")),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(record("texImage2D")),
    pixelStorei: vi.fn(record("pixelStorei")),
    activeTexture: vi.fn(record("activeTexture")),
    uniform1i: vi.fn(record("uniform1i")),

    useProgram: vi.fn(record("useProgram")),
    enable: vi.fn(record("enable")),
    blendFunc: vi.fn(record("blendFunc")),
    drawArrays: vi.fn(record("drawArrays")),
  };

  return gl as unknown as WebGL2RenderingContext;
}

class FakeOffscreenCtx {
  ops: string[] = [];
  imageSmoothingEnabled = false;
  globalCompositeOperation = "source-over";
  globalAlpha = 1;
  setTransform(...a: number[]): void { this.ops.push(`setTransform(${a.join(",")})`); }
  clearRect(...a: number[]): void { this.ops.push(`clearRect(${a.join(",")})`); }
}

class FakeOffscreen {
  width: number;
  height: number;
  ctx = new FakeOffscreenCtx();
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(): Ctx2D {
    return this.ctx as unknown as Ctx2D;
  }
}

let offscreenCtorCalls = 0;
const realOffscreen = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;

beforeEach(() => {
  offscreenCtorCalls = 0;
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = class {
    constructor(w: number, h: number) {
      offscreenCtorCalls += 1;
      return new FakeOffscreen(w, h) as unknown as OffscreenCanvas;
    }
  };
});

afterEach(() => {
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = realOffscreen;
});

describe("OverlayLightPass", () => {
  it("is a fully-skipped no-op when overlay is undefined: no bake canvas, no GL draw work", async () => {
    const calls: Call[] = [];
    const gl = makeFakeGl(calls);
    const { OverlayLightPass } = await import("./overlay-light-pass");
    const pass = new OverlayLightPass(gl);

    pass.draw(undefined, { sx: 1, sy: 1, ox: 0, oy: 0 }, 800, 600);

    expect(offscreenCtorCalls).toBe(0);
    expect(calls.some((c) => c.op === "texImage2D")).toBe(false);
    expect(calls.some((c) => c.op === "drawArrays")).toBe(false);
    expect(calls.some((c) => c.op === "useProgram")).toBe(false);
  });

  it("invokes the overlay with the world transform applied, then bakes+draws additively", async () => {
    const calls: Call[] = [];
    const gl = makeFakeGl(calls);
    const { OverlayLightPass } = await import("./overlay-light-pass");
    const pass = new OverlayLightPass(gl);

    let sawCtx: Ctx2D | undefined;
    let sawTransform: unknown;
    const overlay: OverlayFn = (ctx, transform) => {
      sawCtx = ctx;
      sawTransform = transform;
      (ctx as unknown as { globalCompositeOperation: string }).globalCompositeOperation = "lighter";
    };

    const view = { sx: 2, sy: 3, ox: 10, oy: 20 };
    pass.draw(overlay, view, 800, 600);

    expect(sawTransform).toEqual(view);
    const fakeCtx = sawCtx as unknown as FakeOffscreenCtx;
    // Cleared identity, then the world transform was applied BEFORE the callback ran.
    expect(fakeCtx.ops).toEqual([
      "setTransform(1,0,0,1,0,0)",
      "clearRect(0,0,800,600)",
      "setTransform(2,0,0,3,10,20)",
      "setTransform(1,0,0,1,0,0)",
    ]);
    // Reset back to source-over/full-alpha after the callback, even though the
    // callback itself left "lighter" set.
    expect(fakeCtx.globalCompositeOperation).toBe("source-over");
    expect(fakeCtx.globalAlpha).toBe(1);

    // Uploaded premultiplied, additive blend, one full-screen triangle.
    expect(calls.some((c) => c.op === "pixelStorei" && c.args[1] === true)).toBe(true);
    expect(calls.some((c) => c.op === "texImage2D")).toBe(true);
    // ...and the context-global flag was RESTORED (audit-39). Asserting only the
    // `true` above is what pinned the bug: the upload is correct, the leak is not.
    expect(calls.some((c) => c.op === "pixelStorei" && c.args[1] === false)).toBe(true);
    expect(calls.some((c) => c.op === "blendFunc" && c.args[0] === gl.ONE && c.args[1] === gl.ONE)).toBe(true);
    expect(calls.some((c) => c.op === "drawArrays" && c.args[0] === gl.TRIANGLES && c.args[1] === 0 && c.args[2] === 3)).toBe(true);
  });

  it("restores UNPACK_PREMULTIPLY_ALPHA_WEBGL to false, in order, after every draw", async () => {
    const calls: Call[] = [];
    const gl = makeFakeGl(calls);
    const { OverlayLightPass } = await import("./overlay-light-pass");
    const pass = new OverlayLightPass(gl);

    pass.draw(() => {}, { sx: 1, sy: 1, ox: 0, oy: 0 }, 800, 600);
    pass.draw(() => {}, { sx: 1, sy: 1, ox: 0, oy: 0 }, 800, 600);

    const flag = calls
      .filter((c) => c.op === "pixelStorei" && c.args[0] === gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)
      .map((c) => c.args[1]);
    // Matched pairs, never left dangling: a set is always followed by a restore.
    expect(flag).toEqual([true, false, true, false]);

    // The set/restore straddle the upload, and nothing else uploads in between.
    const seq = calls
      .filter((c) => c.op === "pixelStorei" || c.op === "texImage2D")
      .map((c) => (c.op === "texImage2D" ? "upload" : `flag=${String(c.args[1])}`));
    expect(seq.slice(0, 3)).toEqual(["flag=true", "upload", "flag=false"]);

    // The state a LATER pass would observe: straight-alpha uploads are safe again.
    expect(flag.at(-1)).toBe(false);
  });

  it("leaves a LATER straight-alpha upload unaffected — the season-change re-bake case", async () => {
    // The real failure: SimHost re-bakes and re-posts the static layer on every
    // season change, thousands of overlay frames in. `pixelStorei` is context state,
    // so the victim is whatever uploads NEXT. Model that state explicitly rather than
    // only inspecting the call log.
    const calls: Call[] = [];
    const gl = makeFakeGl(calls);
    const pixelStore = new Map<number, unknown>();
    const realPixelStorei = gl.pixelStorei.bind(gl);
    (gl as { pixelStorei: (p: number, v: unknown) => void }).pixelStorei = (p, v) => {
      pixelStore.set(p, v);
      realPixelStorei(p, v as never);
    };

    const { OverlayLightPass } = await import("./overlay-light-pass");
    const pass = new OverlayLightPass(gl);
    for (let frame = 0; frame < 3; frame++) {
      pass.draw(() => {}, { sx: 1, sy: 1, ox: 0, oy: 0 }, 800, 600);
    }

    // What static-layer-pass / water-pass / gl-atlas-store see when they upload next.
    // They push STRAIGHT alpha and premultiply in their own shaders (`c.rgb * c.a`);
    // a stuck `true` here renders them at rgb*a² — sub-opaque pixels darkened.
    expect(pixelStore.get(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(false);
  });

  it("reuses the bake canvas across same-size draws, recreates it on a drawing-buffer resize", async () => {
    const calls: Call[] = [];
    const gl = makeFakeGl(calls);
    const { OverlayLightPass } = await import("./overlay-light-pass");
    const pass = new OverlayLightPass(gl);
    const overlay: OverlayFn = () => {};

    pass.draw(overlay, { sx: 1, sy: 1, ox: 0, oy: 0 }, 800, 600);
    pass.draw(overlay, { sx: 1, sy: 1, ox: 0, oy: 0 }, 800, 600);
    expect(offscreenCtorCalls).toBe(1);

    pass.draw(overlay, { sx: 1, sy: 1, ox: 0, oy: 0 }, 1024, 768);
    expect(offscreenCtorCalls).toBe(2);
  });
});
