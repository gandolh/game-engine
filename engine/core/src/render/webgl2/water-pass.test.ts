// water-pass.test.ts — WebGL2 sibling coverage for ./water-pass.ts. Mock-GL only (see
// ./static-layer-pass.test.ts's header for why); the real render proof is the tracker screenshot.
import { describe, it, expect, vi } from "vitest";
import { WaterPass } from "./water-pass";
import type { GlContext } from "./gl-context";
import type { LoadedAtlasImage } from "../../assets/loader";
import type { ViewUniform } from "../view-uniform";

// See ../render/webgl2/static-layer-pass.test.ts's identical stub for why: `bakePattern`/
// `setDepthMask`... actually only `bakePattern` calls `createOffscreen`, which falls back to
// `document.createElement("canvas")` in node.
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
          drawImage: () => {},
        };
      },
    };
  },
};

interface FakeTexture {
  __kind: "texture";
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
  calls: {
    drawArrays: unknown[][];
    uniform4f: unknown[][];
    uniform1f: unknown[][];
    texParameteri: unknown[][];
    texImage2D: unknown[][];
    pixelStorei: unknown[][];
  };
} {
  const calls = {
    drawArrays: [] as unknown[][],
    uniform4f: [] as unknown[][],
    uniform1f: [] as unknown[][],
    texParameteri: [] as unknown[][],
    texImage2D: [] as unknown[][],
    pixelStorei: [] as unknown[][],
  };

  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    TEXTURE_2D: 5,
    TEXTURE0: 6,
    TEXTURE1: 60,
    TRIANGLE_STRIP: 7,
    RGBA: 8,
    UNSIGNED_BYTE: 9,
    NEAREST: 10,
    LINEAR: 100,
    CLAMP_TO_EDGE: 11,
    REPEAT: 110,
    TEXTURE_MIN_FILTER: 12,
    TEXTURE_MAG_FILTER: 13,
    TEXTURE_WRAP_S: 14,
    TEXTURE_WRAP_T: 15,
    UNPACK_FLIP_Y_WEBGL: 16,
    UNPACK_ALIGNMENT: 160,
    BLEND: 17,
    FUNC_ADD: 18,
    ONE: 19,
    ONE_MINUS_SRC_ALPHA: 20,
    MAX_TEXTURE_SIZE: 21,
    R8: 210,
    RED: 211,

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
    uniform1f: vi.fn((...args: unknown[]) => calls.uniform1f.push(args)),
    uniform1i: vi.fn(),
    uniform4f: vi.fn((...args: unknown[]) => calls.uniform4f.push(args)),

    getParameter: vi.fn(() => 8192),
    createTexture: vi.fn((): FakeTexture => ({ __kind: "texture" })),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    activeTexture: vi.fn(),
    pixelStorei: vi.fn((...args: unknown[]) => calls.pixelStorei.push(args)),
    texImage2D: vi.fn((...args: unknown[]) => calls.texImage2D.push(args)),
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

function fakeAtlas(frameW = 16, frameH = 16): LoadedAtlasImage {
  return {
    manifest: { id: "terrain", imageUrl: "", width: 64, height: 64, frames: {} },
    bitmap: {} as unknown as ImageBitmap,
    frameRect: () => ({ x: 0, y: 0, w: frameW, h: frameH }),
  } as unknown as LoadedAtlasImage;
}

const identityView: ViewUniform = { scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0, timeSec: 0, windStrength: 1 };
const visRect = { visL: 0, visT: 0, visR: 640, visB: 480 };

describe("WaterPass", () => {
  it("does nothing on draw() before bakePattern()", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    pass.setView(identityView);
    pass.draw(fakeGlContext(gl), identityView, visRect, false);
    expect(calls.drawArrays.length).toBe(0);
  });

  it("bakePattern then draw() issues exactly one attributeless triangle-strip quad", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bakePattern(atlases, "water", "terrain", 16);
    pass.setView(identityView);
    pass.draw(fakeGlContext(gl), identityView, visRect, false);
    expect(calls.drawArrays).toEqual([[gl.TRIANGLE_STRIP, 0, 4]]);
  });

  it("skips drawing when the context reports lost", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bakePattern(atlases, "water", "terrain", 16);
    pass.setView(identityView);
    pass.draw(fakeGlContext(gl, true), identityView, visRect, false);
    expect(calls.drawArrays.length).toBe(0);
  });

  it("skips drawing when the visible rect is empty/inverted", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bakePattern(atlases, "water", "terrain", 16);
    pass.setView(identityView);
    pass.draw(fakeGlContext(gl), identityView, { visL: 100, visT: 0, visR: 0, visB: 480 }, false);
    expect(calls.drawArrays.length).toBe(0);
  });

  it("uploads the scrolling pattern texture as REPEAT — the one texture in this port that needs it", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bakePattern(atlases, "water", "terrain", 16);

    const wrapCalls = calls.texParameteri.filter(
      (args) => args[1] === gl.TEXTURE_WRAP_S || args[1] === gl.TEXTURE_WRAP_T,
    );
    expect(wrapCalls.length).toBeGreaterThan(0);
    for (const args of wrapCalls) expect(args[2]).toBe(gl.REPEAT);
  });

  it("uploads the depth mask as CLAMP_TO_EDGE + LINEAR, with UNPACK_ALIGNMENT set to 1 then restored", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    // tilesX=3 is not a multiple of 4 — exactly the case UNPACK_ALIGNMENT=1 guards against.
    pass.setDepthMask(new Uint8Array([1, 2, 3, 4, 5, 6]), 3, 2, 300, 200, 100);

    const wrapCalls = calls.texParameteri.filter(
      (args) => args[1] === gl.TEXTURE_WRAP_S || args[1] === gl.TEXTURE_WRAP_T,
    );
    for (const args of wrapCalls) expect(args[2]).toBe(gl.CLAMP_TO_EDGE);
    const filterCalls = calls.texParameteri.filter(
      (args) => args[1] === gl.TEXTURE_MIN_FILTER || args[1] === gl.TEXTURE_MAG_FILTER,
    );
    for (const args of filterCalls) expect(args[2]).toBe(gl.LINEAR);

    const alignmentCalls = calls.pixelStorei.filter((args) => args[0] === gl.UNPACK_ALIGNMENT);
    expect(alignmentCalls).toEqual([
      [gl.UNPACK_ALIGNMENT, 1],
      [gl.UNPACK_ALIGNMENT, 4],
    ]);
  });

  it("setDepthMask throws when data is too small for tilesX*tilesY", () => {
    const { gl } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    expect(() => pass.setDepthMask(new Uint8Array([1, 2]), 3, 3, 300, 300, 100)).toThrow(/too small/);
  });

  it("threads zoomedOut into u_useLinear (dormant plumbing, matches the WGSL original's data[10])", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bakePattern(atlases, "water", "terrain", 16);
    pass.setView(identityView);
    pass.draw(fakeGlContext(gl), identityView, visRect, true);

    const useLinear = calls.uniform1f.find((args) => (args[0] as { __uniform: string }).__uniform === "u_useLinear");
    expect(useLinear).toEqual([{ __uniform: "u_useLinear" }, 1.0]);
  });

  it("setScroll wraps by tileSize; a no-op before any bakePattern (tileSize still 0)", () => {
    const { gl } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    // No throw, no visible effect — tileSize is 0 until bakePattern runs.
    expect(() => pass.setScroll(37, -12)).not.toThrow();
  });

  it("uses the setView() value, not the draw() _view parameter, for the clip transform", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new WaterPass(fakeGlContext(gl));
    const atlases = new Map([["terrain", fakeAtlas()]]);
    pass.bakePattern(atlases, "water", "terrain", 16);
    pass.setView({ scaleX: 3, scaleY: -3, offsetX: 1, offsetY: 2, timeSec: 0, windStrength: 1 });
    pass.draw(fakeGlContext(gl), identityView, visRect, false);

    const viewUpload = calls.uniform4f.find((args) => (args[0] as { __uniform: string }).__uniform === "u_view");
    expect(viewUpload).toEqual([{ __uniform: "u_view" }, 3, -3, 1, 2]);
  });
});
