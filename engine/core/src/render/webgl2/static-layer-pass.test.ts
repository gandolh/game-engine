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
      /static-layer bake is 12000×6000px.*MAX_TEXTURE_SIZE is 8192px.*draw it as patches/s,
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

// The patched static layer. A bake past 4096 px or the device's limit is cut into patches that
// each fit, baked lazily as the view reaches them; draw() blits only the patches the view touches.
describe("StaticLayerPass — patches", () => {
  const atlases = () => new Map([["terrain", fakeAtlas()]]);
  const frame = (pass: StaticLayerPass, gl: WebGL2RenderingContext, l: number, t: number, r: number, b: number) =>
    pass.draw(fakeGlContext(gl), identityView, { visL: l, visT: t, visR: r, visB: b });

  it("a bake that fits stays one texture (today's Farm: 3840 px against 8192)", () => {
    const { gl } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl));
    pass.bake([], atlases(), 3840, 3840);
    expect(pass.info()).toMatchObject({ mode: "single", live: 1, largest: 3840 });
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
  });

  it("a bake past 4096 px is patched even when the device could hold it whole", () => {
    const { gl } = makeFakeGl(); // reports 8192
    const pass = new StaticLayerPass(fakeGlContext(gl));
    pass.bake([], atlases(), 6144, 3072); // Citadel's 192×192 iso world
    expect(pass.info()).toMatchObject({ mode: "patched", patchSize: 2048, cols: 3, rows: 2, live: 0 });
    expect(gl.createTexture).not.toHaveBeenCalled(); // nothing uploads until a view needs it
  });

  it("a bake over the device's limit bakes as patches instead of throwing", () => {
    const { gl } = makeFakeGl();
    vi.mocked(gl.getParameter).mockReturnValue(2048);
    const pass = new StaticLayerPass(fakeGlContext(gl));
    expect(() => pass.bake([], atlases(), 3840, 3840)).not.toThrow();
    expect(pass.info()).toMatchObject({ mode: "patched", patchSize: 2048, cols: 2, rows: 2 });
  });

  it("a host's textureLimit patches a bake that would fit, cropping the edge patches", () => {
    const { gl } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl), 32);
    pass.bake([], atlases(), 100, 70);
    expect(pass.info()).toMatchObject({ mode: "patched", patchSize: 32, cols: 4, rows: 3 });
    frame(pass, gl, 0, 0, 100, 70);
    expect(pass.textureCount).toBe(12);
    const sizes = vi.mocked(gl.texImage2D).mock.calls.length;
    expect(sizes).toBe(12);
  });

  it("draws only the patches the view touches, each with its own src/dst rect", () => {
    const { gl, calls } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl), 32);
    pass.bake([], atlases(), 128, 128); // 4×4 patches
    pass.setView(identityView);
    frame(pass, gl, 40, 40, 70, 70); // inside patches (1..2, 1..2)
    expect(calls.drawArrays.length).toBe(4);
    const dst = calls.uniform4f.filter((a) => (a[0] as { __uniform: string }).__uniform === "u_dstRect").map((a) => a.slice(1));
    // The four dst rects tile the visible rect exactly: no gap, no overlap at x = 64 / y = 64.
    expect(dst).toEqual([
      [40, 40, 64, 64],
      [64, 40, 70, 64],
      [40, 64, 64, 70],
      [64, 64, 70, 70],
    ]);
  });

  it("bakes one ring patch ahead per frame and frees patches two rings out", () => {
    const { gl } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl), 32);
    pass.bake([], atlases(), 320, 32); // a 10×1 strip
    frame(pass, gl, 0, 0, 32, 32); // patch 0 visible, patch 1 baked ahead
    expect(pass.info()).toMatchObject({ live: 2, produced: 2 });
    frame(pass, gl, 0, 0, 32, 32); // nothing left to bake ahead (the ring is just patch 1)
    expect(pass.info()).toMatchObject({ live: 2, produced: 2 });
    frame(pass, gl, 160, 0, 192, 32); // jump to patch 5: 0 and 1 are freed
    expect(pass.info()).toMatchObject({ live: 2, produced: 4 });
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    frame(pass, gl, 160, 0, 192, 32); // the other ring neighbour now
    expect(pass.info()).toMatchObject({ live: 3, produced: 5 });
  });

  it("the decorator bakes each patch with that patch's world rect, on the world's extent", () => {
    const { gl } = makeFakeGl();
    const decorate = vi.fn();
    const pass = new StaticLayerPass(fakeGlContext(gl), 32);
    pass.bake([], atlases(), 64, 32, decorate);
    frame(pass, gl, 40, 0, 50, 32); // patch 1 visible, patch 0 ahead
    expect(decorate.mock.calls.map((c) => c.slice(1))).toEqual([
      [64, 32, { originX: 32, originY: 0, width: 32, height: 32 }],
      [64, 32, { originX: 0, originY: 0, width: 32, height: 32 }],
    ]);
  });

  it("a world twice Farm's width (480×480 tiles, 7680 px) never holds a texture over 2048 px, and memory follows the view", () => {
    const { gl } = makeFakeGl(); // a desktop driver: 8192
    const pass = new StaticLayerPass(fakeGlContext(gl));
    const world = 480 * 16;
    pass.bake([], atlases(), world, world);
    expect(pass.info()).toMatchObject({ mode: "patched", patchSize: 2048, cols: 4, rows: 4 });
    // A 1280×720 view crossing the world left to right along its middle, 64 px a frame.
    let maxLive = 0;
    for (let x = 0; x + 1280 <= world; x += 64) {
      frame(pass, gl, x, 3500, x + 1280, 4220);
      const info = pass.info();
      expect(info.largest).toBeLessThanOrEqual(2048);
      maxLive = Math.max(maxLive, info.live);
    }
    // The view touches at most 2×2 patches, and the ring round it can reach the whole 4×4 grid of
    // a world this size. What bounds memory is the freeing: crossing frees the left columns, so at
    // the right edge only the two right columns (8 patches) are held.
    expect(maxLive).toBeLessThanOrEqual(16);
    expect(gl.deleteTexture).toHaveBeenCalled();
    expect(pass.info().live).toBeLessThanOrEqual(8);
  });

  it("clear() deletes every live patch texture", () => {
    const { gl } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl), 32);
    pass.bake([], atlases(), 64, 64);
    frame(pass, gl, 0, 0, 64, 64);
    pass.clear();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(4);
    expect(pass.textureCount).toBe(0);
    expect(pass.info().mode).toBe("none");
  });
});

describe("StaticLayerPass — painted images", () => {
  const manifest = {
    version: 1 as const,
    width: 64,
    height: 32,
    patchSize: 32,
    patches: [
      { file: "patch-0-0.png", x: 0, y: 0, w: 32, h: 32 },
      { file: "patch-1-0.png", x: 32, y: 0, w: 32, h: 32 },
    ],
  };

  it("uploads a patch once its file has loaded, and releases it when freed", () => {
    const { gl } = makeFakeGl();
    const ready = new Set<number>();
    const released: number[] = [];
    const image = {
      manifest,
      produce: (key: number) => (ready.has(key) ? ({} as ImageBitmap) : null),
      release: (key: number) => released.push(key),
    };
    const pass = new StaticLayerPass(fakeGlContext(gl));
    pass.bakeImage(image);
    pass.draw(fakeGlContext(gl), identityView, { visL: 0, visT: 0, visR: 30, visB: 30 });
    expect(pass.info()).toMatchObject({ mode: "patched", live: 0 }); // still loading
    ready.add(0);
    ready.add(1);
    pass.draw(fakeGlContext(gl), identityView, { visL: 0, visT: 0, visR: 30, visB: 30 });
    expect(pass.info()).toMatchObject({ live: 2 }); // patch 0, and patch 1 ahead
    pass.clear();
    expect(released.sort()).toEqual([0, 1]);
  });

  it("refuses patches bigger than the device allows", () => {
    const { gl } = makeFakeGl();
    const pass = new StaticLayerPass(fakeGlContext(gl), 16);
    expect(() => pass.bakeImage({ manifest, produce: () => null })).toThrow(/Cut the image at a smaller patch size/);
  });
});

// The static layer's canvas bake has its top row at world top. WebGL stores a canvas source
// bottom row first while UNPACK_FLIP_Y_WEBGL is on, and every shader here reads v=0 as the
// world-top edge, so the flag must be off at upload. It was on until 2026-11-03, and every baked
// layer was drawn upside down; mocks can't see that, so this pins the flag. The browser check is
// tools/image-patches' harness (a sand band on the top edge only).
describe("StaticLayerPass — upload orientation", () => {
  it("uploads with UNPACK_FLIP_Y_WEBGL off, single texture and patches alike", () => {
    for (const limit of [Number.POSITIVE_INFINITY, 32]) {
      const { gl } = makeFakeGl();
      let flip = false;
      const flips: boolean[] = [];
      vi.mocked(gl.pixelStorei).mockImplementation((p: number, v: number | boolean) => {
        if (p === gl.UNPACK_FLIP_Y_WEBGL) flip = Boolean(v);
      });
      vi.mocked(gl.texImage2D).mockImplementation(() => {
        flips.push(flip);
      });
      flip = true; // left on by someone else: the upload must still turn it off
      const pass = new StaticLayerPass(fakeGlContext(gl), limit);
      pass.bake([], new Map([["terrain", fakeAtlas()]]), 64, 64);
      pass.draw(fakeGlContext(gl), identityView, { visL: 0, visT: 0, visR: 64, visB: 64 });
      expect(flips.length).toBeGreaterThan(0);
      expect(flips.every((f) => !f)).toBe(true);
    }
  });
});
