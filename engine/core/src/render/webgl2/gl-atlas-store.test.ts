import { describe, it, expect, vi } from "vitest";
import { GlAtlasStore, createGlAtlasStore } from "./gl-atlas-store";
import type { LoadedAtlasImage } from "../../assets/loader";

// node's vitest env has no real WebGL2. Per the project convention (../webgpu/
// renderer.test.ts's fake device, ./program.test.ts's fake GL), GlAtlasStore is
// exercised against a mock GL object rather than a real context.

interface FakeTexture {
  __kind: "texture";
  deleted: boolean;
  uploads: Array<{ flipYAtUpload: boolean }>;
  params: Record<number, number>;
}

function makeFakeGl() {
  let currentBoundTexture: FakeTexture | null = null;
  let flipY = false;
  const deletedTextures: FakeTexture[] = [];

  const gl = {
    TEXTURE_2D: 1,
    RGBA: 2,
    UNSIGNED_BYTE: 3,
    NEAREST: 4,
    CLAMP_TO_EDGE: 5,
    TEXTURE_MIN_FILTER: 6,
    TEXTURE_MAG_FILTER: 7,
    TEXTURE_WRAP_S: 8,
    TEXTURE_WRAP_T: 9,
    UNPACK_FLIP_Y_WEBGL: 10,

    createTexture: vi.fn((): FakeTexture => ({ __kind: "texture", deleted: false, uploads: [], params: {} })),
    bindTexture: vi.fn((_target: number, tex: FakeTexture | null) => {
      currentBoundTexture = tex;
    }),
    pixelStorei: vi.fn((pname: number, value: boolean) => {
      if (pname === gl.UNPACK_FLIP_Y_WEBGL) flipY = value;
    }),
    texImage2D: vi.fn(() => {
      currentBoundTexture?.uploads.push({ flipYAtUpload: flipY });
    }),
    texParameteri: vi.fn((_target: number, pname: number, value: number) => {
      if (currentBoundTexture) currentBoundTexture.params[pname] = value;
    }),
    deleteTexture: vi.fn((tex: FakeTexture) => {
      tex.deleted = true;
      deletedTextures.push(tex);
    }),
  };

  return { gl: gl as unknown as WebGL2RenderingContext, raw: gl, deletedTextures };
}

function fakeAtlas(id: string, width: number, height: number, frames: Record<string, { x: number; y: number; w: number; h: number }>): LoadedAtlasImage {
  return {
    manifest: { id, imageUrl: "", width, height, frames } as unknown as LoadedAtlasImage["manifest"],
    bitmap: {} as unknown as ImageBitmap,
    frameRect: (name: string) => {
      const r = frames[name];
      if (!r) throw new Error(`no frame ${name}`);
      return r;
    },
  };
}

describe("GlAtlasStore#add", () => {
  it("uploads with UNPACK_FLIP_Y_WEBGL set true during texImage2D, then restores false", () => {
    const { gl, raw } = makeFakeGl();
    const store = new GlAtlasStore(gl);
    const atlas = fakeAtlas("sheetA", 64, 64, { f: { x: 0, y: 0, w: 16, h: 16 } });

    store.add(atlas);

    const tex = (raw.createTexture as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeTexture;
    expect(tex.uploads).toEqual([{ flipYAtUpload: true }]);
    // pixelStorei called with true then false (restored after upload).
    const flipCalls = (raw.pixelStorei as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === raw.UNPACK_FLIP_Y_WEBGL,
    );
    expect(flipCalls.map((c: unknown[]) => c[1])).toEqual([true, false]);
  });

  it("sets NEAREST filtering and CLAMP_TO_EDGE wrapping (never linear/mipmap)", () => {
    const { gl, raw } = makeFakeGl();
    const store = new GlAtlasStore(gl);
    store.add(fakeAtlas("sheetA", 64, 64, { f: { x: 0, y: 0, w: 16, h: 16 } }));

    const tex = (raw.createTexture as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeTexture;
    expect(tex.params[raw.TEXTURE_MIN_FILTER]).toBe(raw.NEAREST);
    expect(tex.params[raw.TEXTURE_MAG_FILTER]).toBe(raw.NEAREST);
    expect(tex.params[raw.TEXTURE_WRAP_S]).toBe(raw.CLAMP_TO_EDGE);
    expect(tex.params[raw.TEXTURE_WRAP_T]).toBe(raw.CLAMP_TO_EDGE);
  });

  it("deletes the previous texture when re-adding the same atlas id", () => {
    const { gl, raw } = makeFakeGl();
    const store = new GlAtlasStore(gl);
    store.add(fakeAtlas("sheetA", 64, 64, { f: { x: 0, y: 0, w: 16, h: 16 } }));
    const first = (raw.createTexture as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeTexture;

    store.add(fakeAtlas("sheetA", 32, 32, { f: { x: 0, y: 0, w: 8, h: 8 } }));

    expect(first.deleted).toBe(true);
  });
});

describe("GlAtlasStore#uv", () => {
  it("computes top-left-origin UV fractions with no extra v-flip (the flip lives in add(), not here)", () => {
    const { gl } = makeFakeGl();
    const store = new GlAtlasStore(gl);
    store.add(fakeAtlas("sheetA", 100, 200, { f: { x: 10, y: 20, w: 30, h: 40 } }));

    const uv = store.uv("sheetA", "f");
    expect(uv).toEqual({ u0: 0.1, v0: 0.1, u1: 0.4, v1: 0.3, layer: 0 });
  });

  it("throws for an unloaded atlas id", () => {
    const { gl } = makeFakeGl();
    const store = new GlAtlasStore(gl);
    expect(() => store.uv("missing", "f")).toThrow(/missing/);
  });
});

describe("GlAtlasStore#texture / dispose", () => {
  it("returns the GL texture handle for a loaded sheet and throws for an unknown id", () => {
    const { gl } = makeFakeGl();
    const store = new GlAtlasStore(gl);
    store.add(fakeAtlas("sheetA", 64, 64, { f: { x: 0, y: 0, w: 16, h: 16 } }));

    expect(store.texture("sheetA")).toBeTruthy();
    expect(() => store.texture("nope")).toThrow(/nope/);
  });

  it("dispose() deletes every owned texture", () => {
    const { gl, deletedTextures } = makeFakeGl();
    const store = new GlAtlasStore(gl);
    store.add(fakeAtlas("a", 64, 64, { f: { x: 0, y: 0, w: 16, h: 16 } }));
    store.add(fakeAtlas("b", 64, 64, { f: { x: 0, y: 0, w: 16, h: 16 } }));

    store.dispose();

    expect(deletedTextures.length).toBe(2);
  });
});

describe("createGlAtlasStore", () => {
  it("constructs a GlAtlasStore", () => {
    const { gl } = makeFakeGl();
    expect(createGlAtlasStore(gl)).toBeInstanceOf(GlAtlasStore);
  });
});
