// static-layer-pass.test.ts — WebGL2 sibling of ../webgpu/static-layer-pass.test.ts.
//
// node's vitest env has no real WebGL2. Per project convention (../webgpu/renderer.test.ts's fake
// device, ./program.test.ts's fake gl), everything here runs against a mock GL object.
import { describe, it, expect, vi } from "vitest";
import { assertTextureWithinLimits, StaticLayerPass } from "./static-layer-pass";
import type { GlContext } from "./gl-context";
import type { LoadedAtlasImage } from "../../assets/loader";
import type { Sprite } from "../renderer";
import type { ViewUniform } from "../view-uniform";

// node's vitest env has neither OffscreenCanvas nor `document`. `bake()` calls the shared
// `createOffscreen` (../raster2d.ts), which falls back to `document.createElement("canvas")` when
// OffscreenCanvas is undefined — stub the minimal 2D context surface it needs (see ../webgpu/
// renderer.test.ts for the precedent). Our fixtures use untinted, unrotated sprites, so `drawImage`
// is the only draw primitive `raster2d.ts`'s `drawSprite` needs from this stub.
const g = globalThis as unknown as Record<string, unknown>;
g.document ??= {
  createElement: (tag: string) => {
    if (tag !== "canvas") return {};
    return {
      width: 0,
      height: 0,
      getContext: (type: string) => {
        if (type !== "2d") return null;
        return {
          imageSmoothingEnabled: false,
          clearRect: () => {},
          translate: () => {},
          drawImage: () => {},
        };
      },
    };
  },
};

// ── assertTextureWithinLimits — WebGL2 sibling of the WebGPU regression suite ──────────────────
//
// Brief 110's guard, ported: Citadel's 256×256 world lands its iso texture at exactly 8192px wide.
// WebGPU hardcodes 8192 as `maxTextureDimension2D`'s default; WebGL2 reads the REAL driver limit via
// `gl.getParameter(MAX_TEXTURE_SIZE)`, which differs per driver — these tests prove both the "throws
// above the limit" and "passes at exactly the limit" edges against a fake reporting 8192.

function glWithLimit(maxTextureSize: number): WebGL2RenderingContext {
  const gl = { MAX_TEXTURE_SIZE: 0x0d33, getParameter: (_p: number) => maxTextureSize };
  return gl as unknown as WebGL2RenderingContext;
}

describe("assertTextureWithinLimits", () => {
  const gl = glWithLimit(8192);

  it("passes a texture inside the limit", () => {
    expect(() => assertTextureWithinLimits(gl, 6144, 3088)).not.toThrow();
  });

  it("passes a texture exactly ON the limit (8192 is valid, not one past it)", () => {
    expect(() => assertTextureWithinLimits(gl, 8192, 4112)).not.toThrow();
  });

  it("throws when the width exceeds the limit", () => {
    expect(() => assertTextureWithinLimits(gl, 8193, 100)).toThrow(RangeError);
  });

  it("throws when the height exceeds the limit", () => {
    expect(() => assertTextureWithinLimits(gl, 100, 9000)).toThrow(RangeError);
  });

  it("names the offending size, the limit, and the way out", () => {
    expect(() => assertTextureWithinLimits(gl, 12000, 6000, "static-layer bake")).toThrow(
      /static-layer bake is 12000×6000px.*MAX_TEXTURE_SIZE is 8192px.*window the bake/s,
    );
  });

  it("respects a driver that reports a different (larger) limit", () => {
    expect(() => assertTextureWithinLimits(glWithLimit(16384), 12000, 6000)).not.toThrow();
  });

  // The sizes that motivated the guard, as arithmetic. Iso world-px for an N×N tile
  // world is (N+N)·16 wide by (N+N)·8 + 16 tall.
  it("Citadel's world sizes, measured against a driver reporting 8192", () => {
    const iso = (n: number): [number, number] => [(n + n) * 16, (n + n) * 8 + 16];
    expect(() => assertTextureWithinLimits(gl, ...iso(96))).not.toThrow(); // 3072×1552
    expect(() => assertTextureWithinLimits(gl, ...iso(192))).not.toThrow(); // 6144×3088
    expect(() => assertTextureWithinLimits(gl, ...iso(256))).not.toThrow(); // 8192×4112 — exactly on it
    expect(() => assertTextureWithinLimits(gl, ...iso(257))).toThrow(RangeError); // 8224 — over
  });
});

// ── StaticLayerPass — mock-GL smoke tests (visual proof lives in the tracker screenshot, not here) ──

interface FakeTexture {
  __kind: "texture";
  deleted: boolean;
}
interface FakeShader {
  __kind: "shader";
  compiled: boolean;
}
interface FakeProgram {
  __kind: "program";
  linked: boolean;
}

function makeFakeGl(): {
  gl: WebGL2RenderingContext;
  calls: { drawArrays: unknown[][]; uniform4f: unknown[][]; texParameteri: unknown[][] };
} {
  const calls = {
    drawArrays: [] as unknown[][],
    uniform4f: [] as unknown[][],
    texParameteri: [] as unknown[][],
  };

  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TEXTURE_2D: 5,
    TEXTURE0: 6,
    TRIANGLE_STRIP: 7,
    RGBA: 8,
    UNSIGNED_BYTE: 9,
    NEAREST: 10,
    CLAMP_TO_EDGE: 11,
    TEXTURE_MIN_FILTER: 12,
    TEXTURE_MAG_FILTER: 13,
    TEXTURE_WRAP_S: 14,
    TEXTURE_WRAP_T: 15,
    UNPACK_FLIP_Y_WEBGL: 16,
    BLEND: 17,
    FUNC_ADD: 18,
    ONE: 19,
    ONE_MINUS_SRC_ALPHA: 20,
    MAX_TEXTURE_SIZE: 21,

    createShader: vi.fn((): FakeShader => ({ __kind: "shader", compiled: false })),
    shaderSource: vi.fn(),
    compileShader: vi.fn((s: FakeShader) => {
      s.compiled = true;
    }),
    getShaderParameter: vi.fn((s: FakeShader) => s.compiled),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),

    createProgram: vi.fn((): FakeProgram => ({ __kind: "program", linked: false })),
    attachShader: vi.fn(),
    linkProgram: vi.fn((p: FakeProgram) => {
      p.linked = true;
    }),
    getProgramParameter: vi.fn((p: FakeProgram) => p.linked),
    getProgramInfoLog: vi.fn(() => ""),
    deleteProgram: vi.fn(),

    getUniformLocation: vi.fn((_p: FakeProgram, name: string) => ({ __uniform: name })),
    useProgram: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform4f: vi.fn((...args: unknown[]) => calls.uniform4f.push(args)),

    getParameter: vi.fn(() => 8192),
    createTexture: vi.fn((): FakeTexture => ({ __kind: "texture", deleted: false })),
    deleteTexture: vi.fn((t: FakeTexture) => {
      t.deleted = true;
    }),
    bindTexture: vi.fn(),
    activeTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn((...args: unknown[]) => calls.texParameteri.push(args)),

    enable: vi.fn(),
    blendEquation: vi.fn(),
    blendFuncSeparate: vi.fn(),
    drawArrays: vi.fn((...args: unknown[]) => calls.drawArrays.push(args)),
  };

  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}

function fakeGlContext(gl: WebGL2RenderingContext, lost = false): GlContext {
  return { gl, canvas: {} as HTMLCanvasElement, isLost: () => lost } as unknown as GlContext;
}

function fakeAtlas(): LoadedAtlasImage {
  return {
    manifest: { id: "terrain", imageUrl: "", width: 64, height: 64, frames: {} },
    bitmap: {} as unknown as ImageBitmap,
    frameRect: () => ({ x: 0, y: 0, w: 16, h: 16 }),
  } as unknown as LoadedAtlasImage;
}

function sprite(partial: Partial<Sprite>): Sprite {
  return { x: 0, y: 0, width: 16, height: 16, frame: "f", atlasId: "terrain", rotation: 0, layer: 0, alpha: 1, ...partial };
}

const identityView: ViewUniform = { scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0, timeSec: 0, windStrength: 1 };

describe("StaticLayerPass", () => {
  it("does nothing on draw() before any bake()", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl));
    pass.setView(identityView);
    pass.draw(fakeGlContext(gl), identityView, { visL: 0, visT: 0, visR: 100, visB: 100 });
    expect(calls.drawArrays.length).toBe(0);
  });

  it("bakes then draws exactly one attributeless triangle-strip quad", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bake([sprite({ x: 8, y: 8 })], atlases, 64, 64);
    pass.setView(identityView);
    pass.draw(fakeGlContext(gl), identityView, { visL: 0, visT: 0, visR: 64, visB: 64 });

    expect(calls.drawArrays).toEqual([[gl.TRIANGLE_STRIP, 0, 4]]);
  });

  it("clear() makes a subsequent draw() a no-op", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bake([], atlases, 64, 64);
    pass.clear();
    pass.setView(identityView);
    pass.draw(fakeGlContext(gl), identityView, { visL: 0, visT: 0, visR: 64, visB: 64 });
    expect(calls.drawArrays.length).toBe(0);
  });

  it("skips drawing when the context reports lost", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bake([], atlases, 64, 64);
    pass.setView(identityView);
    pass.draw(fakeGlContext(gl, true), identityView, { visL: 0, visT: 0, visR: 64, visB: 64 });
    expect(calls.drawArrays.length).toBe(0);
  });

  it("uploads the baked texture as CLAMP_TO_EDGE (every texture but the water pattern is)", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bake([], atlases, 64, 64);

    const wrapCalls = calls.texParameteri.filter(
      (args) => args[1] === gl.TEXTURE_WRAP_S || args[1] === gl.TEXTURE_WRAP_T,
    );
    expect(wrapCalls.length).toBeGreaterThan(0);
    for (const args of wrapCalls) expect(args[2]).toBe(gl.CLAMP_TO_EDGE);
  });

  it("uses the setView() value, not the draw() _view parameter, for the clip transform", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bake([], atlases, 64, 64);
    pass.setView({ scaleX: 2, scaleY: -2, offsetX: 5, offsetY: 7, timeSec: 0, windStrength: 1 });
    // Deliberately pass a DIFFERENT view to draw() to prove it's ignored.
    pass.draw(fakeGlContext(gl), identityView, { visL: 0, visT: 0, visR: 64, visB: 64 });

    const viewUpload = calls.uniform4f.find((args) => (args[0] as { __uniform: string }).__uniform === "u_view");
    expect(viewUpload).toEqual([{ __uniform: "u_view" }, 2, -2, 5, 7]);
  });
});
