import { describe, expect, it, vi } from "vitest";
import type { LoadedAtlasImage } from "../../assets/loader";
import type { Sprite } from "../renderer";
import { hash2 } from "../noise";
import type { GlAtlasStore } from "./gl-atlas-store";
import type { GlContext } from "./gl-context";
import {
  CHUNK_TILES,
  INSTANCE_BYTES,
  SHADE_NONE,
  TileChunkPass,
  planTileChunks,
  quarterTurns,
  shadeByte,
  speckleCut,
  visibleChunkRange,
} from "./tile-chunk-pass";
import type { TileChunkDecor } from "./tile-chunk-pass";

const TILE = 4;
const CHUNK_PX = CHUNK_TILES * TILE; // 128

/** Two sheets on one page bitmap, and a third on its own. Frame `fN` sits at (N, 2N), N×N. */
function atlases(): Map<string, LoadedAtlasImage> {
  const page = {} as ImageBitmap;
  const sheet = (id: string, bitmap: ImageBitmap, size: number): LoadedAtlasImage => ({
    manifest: { id, imageUrl: "", frames: {}, width: size, height: size },
    bitmap,
    frameRect: (frame: string) => {
      const n = Number(frame.slice(1));
      return { x: n, y: 2 * n, w: n, h: n };
    },
  });
  return new Map([
    ["terrain", sheet("terrain", page, 256)],
    ["props", sheet("props", page, 256)],
    ["other", sheet("other", {} as ImageBitmap, 64)],
  ]);
}

function sprite(tx: number, ty: number, over: Partial<Sprite> = {}): Sprite {
  return {
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
    width: TILE,
    height: TILE,
    frame: "f4",
    atlasId: "terrain",
    rotation: 0,
    layer: 0,
    alpha: 1,
    ...over,
  };
}

interface Decoded {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rect: [number, number, number, number];
  turns: number;
  flip: boolean;
  kind: number;
  shade: number;
  edges: number;
  speckle: number;
}

function decode(data: Uint8Array, i: number): Decoded {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const o = i * INSTANCE_BYTES;
  const bits = v.getUint8(o + 20);
  return {
    cx: v.getFloat32(o, true),
    cy: v.getFloat32(o + 4, true),
    w: v.getUint16(o + 8, true),
    h: v.getUint16(o + 10, true),
    rect: [v.getUint16(o + 12, true), v.getUint16(o + 14, true), v.getUint16(o + 16, true), v.getUint16(o + 18, true)],
    turns: bits & 3,
    flip: (bits & 4) !== 0,
    kind: bits >> 3,
    shade: v.getUint8(o + 21),
    edges: v.getUint8(o + 22),
    speckle: v.getUint8(o + 23),
  };
}

/** A decor for a world `tilesX × tilesY`: no ground, no shade, no edges, no speckles, until set. */
function emptyDecor(tilesX: number, tilesY: number): TileChunkDecor {
  const n = tilesX * tilesY;
  return {
    tilesX,
    tilesY,
    ground: new Uint8Array(n),
    shade: new Float32Array(n),
    shadeDark: "#181425",
    shadeLight: "#ffffff",
    edges: new Uint8Array(n),
    edgeColor: "#c28569",
    edgeBandPx: 1,
    edgeBandAlphas: [0.42, 0.3, 0.2, 0.11],
    speckle: new Uint8Array(n),
    speckleClasses: [
      { density: 0.3, alpha: 0.26, colors: ["#2ce8f5", "#0099db"] },
      { density: 0.16, alpha: 0.18, colors: ["#0099db", "#124e89"] },
    ],
    specklePx: 2,
    speckleSeed: 7,
    speckleColorSeed: 9,
  };
}

describe("quarterTurns", () => {
  it("maps whole quarter turns to 0-3, negative and past a full turn included", () => {
    expect([0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI].map(quarterTurns)).toEqual([0, 1, 2, 3, 0]);
    expect(quarterTurns(-Math.PI / 2)).toBe(3);
  });

  it("refuses any other angle: the chunks draw grid-aligned tiles only", () => {
    expect(() => quarterTurns(0.3)).toThrow(RangeError);
  });
});

describe("shadeByte", () => {
  it("puts no shade at 128 and clamps to a byte", () => {
    expect(shadeByte(0)).toBe(SHADE_NONE);
    expect(shadeByte(-0.12)).toBe(97);
    expect(shadeByte(0.12)).toBe(159);
    expect(shadeByte(-9)).toBe(0);
    expect(shadeByte(9)).toBe(255);
  });
});

describe("speckleCut", () => {
  it("picks exactly the cells the CPU decorator's `hash2 < density` picks", () => {
    for (const density of [0.3, 0.16, 0.5, 0.01]) {
      const cut = speckleCut(density);
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const h = hash2(x, y, 0xc0ffee);
          expect(h * 4294967296 < cut).toBe(h < density);
        }
      }
    }
    expect(speckleCut(0.3)).toBe(1288490189);
  });
});

describe("planTileChunks", () => {
  it("puts each sprite in the chunk under its centre, in a stable compareSprite order", () => {
    const sprites = [
      sprite(40, 1, { layer: 2, frame: "f1" }), // chunk (1, 0)
      sprite(0, 5, { layer: 1, frame: "f2" }), // chunk (0, 0)
      sprite(0, 3, { layer: 1, frame: "f3" }), // chunk (0, 0), same layer, higher up
      sprite(0, 0, { layer: 0, frame: "f4" }), // chunk (0, 0)
      sprite(70, 33, { frame: "f5" }), // chunk (2, 1)
    ];
    const plan = planTileChunks(sprites, atlases(), 3 * CHUNK_PX, 2 * CHUNK_PX, TILE);
    expect([plan.cols, plan.rows, plan.chunkPx]).toEqual([3, 2, CHUNK_PX]);
    expect(plan.chunks.map((c) => c?.instances ?? 0)).toEqual([3, 1, 0, 0, 0, 1]);
    const first = plan.chunks[0];
    if (!first) throw new Error("chunk (0, 0) missing");
    expect([0, 1, 2].map((i) => decode(first.data, i).rect[0])).toEqual([4, 3, 2]);
    expect(plan.instances).toBe(5);
    expect(plan.bytes).toBe(5 * INSTANCE_BYTES);
    expect(plan.overhang).toBe(0);
  });

  it("packs the centre, size, atlas rect, quarter turns and flip of each sprite", () => {
    const s = sprite(3, 2, { frame: "f6", rotation: Math.PI, flipX: true });
    const plan = planTileChunks([s], atlases(), CHUNK_PX, CHUNK_PX, TILE);
    const chunk = plan.chunks[0];
    if (!chunk) throw new Error("chunk missing");
    expect(decode(chunk.data, 0)).toEqual({
      cx: 14,
      cy: 10,
      w: 4,
      h: 4,
      rect: [6, 12, 12, 18],
      turns: 2,
      flip: true,
      kind: 0,
      shade: SHADE_NONE,
      edges: 0,
      speckle: 0,
    });
  });

  it("starts a new texture run only when the bitmap changes, not the sheet id", () => {
    const sprites = [
      sprite(0, 0, { atlasId: "terrain" }),
      sprite(1, 0, { atlasId: "props" }),
      sprite(2, 0, { atlasId: "other" }),
      sprite(3, 0, { atlasId: "terrain" }),
    ];
    const chunk = planTileChunks(sprites, atlases(), CHUNK_PX, CHUNK_PX, TILE).chunks[0];
    expect(chunk?.segments.map((s) => [s.atlasId, s.first, s.count, s.texW])).toEqual([
      ["terrain", 0, 2, 256],
      ["other", 2, 1, 64],
      ["terrain", 3, 1, 256],
    ]);
  });

  it("puts the shade and edges of a ground tile on its sprites, and a decoration quad on the others", () => {
    const decor = emptyDecor(CHUNK_TILES * 2, CHUNK_TILES);
    const ground = 1; // tile (1, 0)
    decor.ground[ground] = 1;
    decor.shade[ground] = -0.1;
    decor.edges[ground] = 5;
    decor.shade[2] = 0.05; // tile (2, 0): no ground, a shade
    decor.speckle[3] = 2; // tile (3, 0): no ground, speckles
    decor.edges[3] = 1; // ignored: bands ride on ground tiles only
    decor.speckle[CHUNK_TILES + 1] = 1; // tile (33, 0), the second chunk
    const sprites = [sprite(1, 0), sprite(1, 0, { layer: 4, frame: "f2" }), sprite(2, 0, { layer: 2 })];
    const plan = planTileChunks(sprites, atlases(), 2 * CHUNK_PX, CHUNK_PX, TILE, decor);
    const first = plan.chunks[0];
    const second = plan.chunks[1];
    if (!first || !second) throw new Error("chunks missing");
    const got = [0, 1, 2, 3, 4].map((i) => decode(first.data, i));
    // The ground tile's two sprites carry its shade and edges; the sprite on tile (2, 0) does not.
    const groundShade = shadeByte(Math.fround(-0.1));
    expect(got.slice(0, 3).map((d) => [d.kind, d.shade, d.edges])).toEqual([
      [0, groundShade, 5],
      [0, SHADE_NONE, 0],
      [0, groundShade, 5],
    ]);
    // Then one decoration quad per tile without ground that has a shade or speckles, after every sprite.
    expect(got.slice(3).map((d) => [d.kind, d.cx, d.cy, d.w, d.shade, d.edges, d.speckle])).toEqual([
      [1, 10, 2, 4, shadeByte(Math.fround(0.05)), 0, 0],
      [1, 14, 2, 4, SHADE_NONE, 0, 2],
    ]);
    expect(first.segments).toEqual([{ atlasId: "terrain", texW: 256, texH: 256, first: 0, count: 5 }]);
    // A chunk of decoration quads only gets a run with no texture.
    expect(second.segments).toEqual([{ atlasId: null, texW: 1, texH: 1, first: 0, count: 1 }]);
    expect(plan.decorInstances).toBe(3);
  });

  it("measures how far a sprite reaches past its chunk, so culling keeps it", () => {
    const big = sprite(31, 0, { width: 24, height: 8 });
    // Centre x 126, half its larger side 12: 10 px past the chunk's right edge at 128 (and past its top).
    expect(planTileChunks([big], atlases(), 2 * CHUNK_PX, CHUNK_PX, TILE).overhang).toBe(10);
  });

  it("fails loudly on what the spike does not draw", () => {
    expect(() => planTileChunks([sprite(0, 0, { atlasId: "nope" })], atlases(), 64, 64, TILE)).toThrow(/not loaded/);
    expect(() => planTileChunks([sprite(0, 0, { rotation: 1 })], atlases(), 64, 64, TILE)).toThrow(RangeError);
    expect(() => planTileChunks([sprite(0, 0, { width: 4.5 })], atlases(), 64, 64, TILE)).toThrow(RangeError);
  });
});

describe("visibleChunkRange", () => {
  const grid = { chunkPx: 512, cols: 8, rows: 8, overhang: 0 };

  it("covers the chunks the view touches, clamped to the grid", () => {
    expect(visibleChunkRange(grid, { visL: 700, visT: 10, visR: 1100, visB: 520 })).toEqual({
      c0: 1,
      c1: 2,
      r0: 0,
      r1: 1,
    });
    expect(visibleChunkRange(grid, { visL: 0, visT: 0, visR: 3840, visB: 3840 })).toEqual({
      c0: 0,
      c1: 7,
      r0: 0,
      r1: 7,
    });
  });

  it("leaves out a chunk the view only meets at its edge", () => {
    expect(visibleChunkRange(grid, { visL: 0, visT: 0, visR: 512, visB: 512 })).toEqual({ c0: 0, c1: 0, r0: 0, r1: 0 });
  });

  it("widens by the overhang, and is null for an empty view", () => {
    expect(visibleChunkRange({ ...grid, overhang: 8 }, { visL: 0, visT: 0, visR: 512, visB: 512 })).toEqual({
      c0: 0,
      c1: 1,
      r0: 0,
      r1: 1,
    });
    expect(visibleChunkRange(grid, { visL: 10, visT: 10, visR: 10, visB: 50 })).toBeNull();
  });
});

interface Call {
  op: string;
  args: unknown[];
}

function fakeGl(calls: Call[]): WebGL2RenderingContext {
  let next = 0;
  const handle = (kind: string) => () => ({ __kind: kind, id: next++ });
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    UNSIGNED_SHORT: 8,
    UNSIGNED_BYTE: 9,
    TEXTURE0: 10,
    TEXTURE_2D: 11,
    BLEND: 12,
    FUNC_ADD: 13,
    ONE: 14,
    ONE_MINUS_SRC_ALPHA: 15,
    TRIANGLE_STRIP: 16,
    createShader: vi.fn(handle("shader")),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    createProgram: vi.fn(handle("program")),
    attachShader: vi.fn(),
    linkProgram: vi.fn(record("linkProgram")),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    getUniformLocation: vi.fn((_p: unknown, name: string) => ({ __uniform: name })),
    useProgram: vi.fn(record("useProgram")),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform1ui: vi.fn(record("uniform1ui")),
    uniform2f: vi.fn(record("uniform2f")),
    uniform2ui: vi.fn(record("uniform2ui")),
    uniform3f: vi.fn(),
    uniform4f: vi.fn(record("uniform4f")),
    createBuffer: vi.fn(handle("buffer")),
    deleteBuffer: vi.fn(record("deleteBuffer")),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(record("bufferData")),
    createVertexArray: vi.fn(handle("vao")),
    deleteVertexArray: vi.fn(record("deleteVertexArray")),
    bindVertexArray: vi.fn(record("bindVertexArray")),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(record("vertexAttribPointer")),
    vertexAttribIPointer: vi.fn(record("vertexAttribIPointer")),
    vertexAttribDivisor: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(record("bindTexture")),
    enable: vi.fn(),
    blendEquation: vi.fn(),
    blendFuncSeparate: vi.fn(),
    drawArraysInstanced: vi.fn(record("drawArraysInstanced")),
    // A texture here would be the bake this pass replaces.
    texImage2D: vi.fn(record("texImage2D")),
    createTexture: vi.fn(record("createTexture")),
  };
  return gl as unknown as WebGL2RenderingContext;
}

function fakeCtx(gl: WebGL2RenderingContext): GlContext & { lost: boolean } {
  const ctx = {
    gl,
    lost: false,
    isLost(): boolean {
      return ctx.lost;
    },
  };
  return ctx as unknown as GlContext & { lost: boolean };
}

function fakeStore(): GlAtlasStore {
  return { texture: (id: string) => ({ __tex: id }) } as unknown as GlAtlasStore;
}

const VIEW = { scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0, timeSec: 0, windStrength: 1 };

/** One ground sprite in each of the four chunks of a 2×2-chunk world, plus one on another bitmap in the first. */
function fourChunks(): Sprite[] {
  return [sprite(0, 0), sprite(1, 0, { atlasId: "other", layer: 1 }), sprite(40, 0), sprite(0, 40), sprite(40, 40)];
}

describe("TileChunkPass", () => {
  it("uploads one static buffer per chunk with anything in it, and creates no texture", () => {
    const calls: Call[] = [];
    const ctx = fakeCtx(fakeGl(calls));
    const pass = new TileChunkPass(ctx, fakeStore);
    pass.build(fourChunks(), atlases(), 2 * CHUNK_PX, 2 * CHUNK_PX, TILE);
    expect(calls.filter((c) => c.op === "bufferData").map((c) => (c.args[1] as Uint8Array).byteLength)).toEqual([
      2 * INSTANCE_BYTES,
      INSTANCE_BYTES,
      INSTANCE_BYTES,
      INSTANCE_BYTES,
    ]);
    expect(calls.filter((c) => c.op === "bufferData").every((c) => c.args[2] === 6)).toBe(true);
    expect(calls.some((c) => c.op === "texImage2D" || c.op === "createTexture")).toBe(false);
    // The second run of the first chunk starts its attributes one instance in; sizes, rects and bits are integers.
    const iPointers = calls.filter((c) => c.op === "vertexAttribIPointer");
    expect(iPointers.slice(0, 3).map((c) => [c.args[0], c.args[4]])).toEqual([
      [1, 8],
      [2, 12],
      [3, 20],
    ]);
    expect(iPointers.slice(3, 6).map((c) => c.args[4])).toEqual([32, 36, 44]);
    expect(pass.stats).toMatchObject({ chunks: 4, instances: 5, bufferBytes: 5 * INSTANCE_BYTES });
  });

  it("draws only the chunks in view, one instanced draw per texture run, and unbinds its VAO", () => {
    const calls: Call[] = [];
    const ctx = fakeCtx(fakeGl(calls));
    const pass = new TileChunkPass(ctx, fakeStore);
    pass.build(fourChunks(), atlases(), 2 * CHUNK_PX, 2 * CHUNK_PX, TILE);
    calls.length = 0;
    pass.draw(ctx, VIEW, { visL: 0, visT: 0, visR: 100, visB: 100 });
    const draws = calls.filter((c) => c.op === "drawArraysInstanced");
    expect(draws.map((c) => c.args)).toEqual([
      [16, 0, 4, 1],
      [16, 0, 4, 1],
    ]);
    expect(calls.filter((c) => c.op === "bindTexture").map((c) => c.args[1])).toEqual([
      { __tex: "terrain" },
      { __tex: "other" },
    ]);
    expect(calls[calls.length - 1]).toEqual({ op: "bindVertexArray", args: [null] });
    expect(pass.stats).toMatchObject({ lastChunks: 1, lastDraws: 2, lastInstances: 2 });

    calls.length = 0;
    pass.draw(ctx, VIEW, { visL: 0, visT: 0, visR: 2 * CHUNK_PX, visB: 2 * CHUNK_PX });
    expect(calls.filter((c) => c.op === "drawArraysInstanced")).toHaveLength(5);
    expect(pass.stats).toMatchObject({ lastChunks: 4, lastDraws: 5, lastInstances: 5 });
  });

  it("sets the decoration's uniforms once per build, the hash cuts as integers", () => {
    const calls: Call[] = [];
    const ctx = fakeCtx(fakeGl(calls));
    const pass = new TileChunkPass(ctx, fakeStore);
    pass.build([sprite(0, 0)], atlases(), CHUNK_PX, CHUNK_PX, TILE, emptyDecor(CHUNK_TILES, CHUNK_TILES));
    expect(calls.filter((c) => c.op === "uniform2ui").map((c) => c.args.slice(1))).toEqual([
      [speckleCut(0.3), speckleCut(0.16)],
    ]);
    expect(calls.filter((c) => c.op === "uniform1ui").map((c) => c.args[1])).toEqual([7, 9]);
    calls.length = 0;
    pass.draw(ctx, VIEW, { visL: 0, visT: 0, visR: 50, visB: 50 });
    expect(calls.some((c) => c.op === "uniform2ui" || c.op === "uniform1ui")).toBe(false);
  });

  it("issues no GL while the context is lost, and rebuilds everything on restore", () => {
    const calls: Call[] = [];
    const ctx = fakeCtx(fakeGl(calls));
    const pass = new TileChunkPass(ctx, fakeStore);
    ctx.lost = true;
    pass.build(fourChunks(), atlases(), 2 * CHUNK_PX, 2 * CHUNK_PX, TILE);
    pass.draw(ctx, VIEW, { visL: 0, visT: 0, visR: 100, visB: 100 });
    expect(calls).toEqual([]);
    expect(pass.built).toBe(true);

    ctx.lost = false;
    pass.restore();
    expect(calls.filter((c) => c.op === "linkProgram")).toHaveLength(1);
    expect(calls.filter((c) => c.op === "bufferData")).toHaveLength(4);
    calls.length = 0;
    pass.draw(ctx, VIEW, { visL: 0, visT: 0, visR: 100, visB: 100 });
    expect(calls.filter((c) => c.op === "drawArraysInstanced")).toHaveLength(2);
  });

  it("frees its buffers and VAOs on clear, and draws nothing after", () => {
    const calls: Call[] = [];
    const ctx = fakeCtx(fakeGl(calls));
    const pass = new TileChunkPass(ctx, fakeStore);
    pass.build(fourChunks(), atlases(), 2 * CHUNK_PX, 2 * CHUNK_PX, TILE);
    calls.length = 0;
    pass.clear();
    expect(calls.filter((c) => c.op === "deleteBuffer")).toHaveLength(4);
    expect(calls.filter((c) => c.op === "deleteVertexArray")).toHaveLength(5);
    expect(pass.built).toBe(false);
    calls.length = 0;
    pass.draw(ctx, VIEW, { visL: 0, visT: 0, visR: 100, visB: 100 });
    expect(calls.filter((c) => c.op === "drawArraysInstanced")).toHaveLength(0);
  });
});
