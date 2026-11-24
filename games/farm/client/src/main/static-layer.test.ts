import { describe, expect, it } from "vitest";
import { EDG } from "@engine/core";
import { hash2 } from "@engine/core/render";
import type { Sprite } from "@engine/core/render";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@farm/sim-core/world/regions";
import { TILE } from "./config";
import { buildTileChunkDecor, tileChunksRequested } from "./static-layer";
import { makeGroundNoiseDecorator } from "../render/ground-noise";
import { makeShoreDescentDecorator } from "../render/shore-descent";
import { makeWaterDepthDecorator } from "../render/water-depth";

// The tile-chunk spike (corpus brief 21) draws the bake's three decorators as shader terms from per-tile
// data. These tests run each decorator against a recording canvas and check that the per-tile data, read
// the way the engine's tile-chunk.frag.glsl reads it, paints the same fills. The GLSL itself only runs in a
// browser: see corpus/verify/2026-11-24-tile-chunk-spike/.

interface Fill {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  alpha: number;
  op: string;
}

function recordingCtx(): { ctx: CanvasRenderingContext2D; fills: Fill[] } {
  const fills: Fill[] = [];
  const ctx = {
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({
        x,
        y,
        w,
        h,
        color: String(this.fillStyle),
        alpha: this.globalAlpha,
        op: this.globalCompositeOperation,
      });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

const SEED = 0xc0ffee;
const WORLD_PX = { w: WORLD_WIDTH * TILE, h: WORLD_HEIGHT * TILE };
/** A coast with sand shores and shallow water (tiles 170-210 × 105-135). */
const COAST = { originX: 170 * TILE, originY: 105 * TILE, width: 40 * TILE, height: 30 * TILE };
const decor = buildTileChunkDecor([], SEED);

/** The shader's band alpha for one edge bit at local pixel (lx, ly). */
function bandAlpha(bit: number, lx: number, ly: number): number {
  const last = TILE - 1;
  const d = bit === 1 ? ly : bit === 2 ? last - lx : bit === 4 ? last - ly : lx;
  return decor.edgeBandAlphas[Math.floor(d / decor.edgeBandPx)] ?? 0;
}

describe("tileChunksRequested", () => {
  it("reads ?tilechunks, alone or beside other parameters", () => {
    expect(tileChunksRequested("?tilechunks")).toBe(true);
    expect(tileChunksRequested("?bench&profile&tilechunks")).toBe(true);
    expect(tileChunksRequested("?bench&profile")).toBe(false);
    expect(tileChunksRequested("")).toBe(false);
  });
});

describe("buildTileChunkDecor", () => {
  it("marks the tiles under a backdrop sprite (layer 0) as ground, and no others", () => {
    const s = (tx: number, ty: number, layer: number): Sprite => ({
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/dirt",
      atlasId: "terrain",
      rotation: 0,
      layer,
      alpha: 1,
    });
    const d = buildTileChunkDecor([s(3, 4, 0), s(5, 6, 1)], SEED);
    expect(d.ground[4 * WORLD_WIDTH + 3]).toBe(1);
    expect(d.ground[6 * WORLD_WIDTH + 5]).toBe(0);
    expect(d.ground.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("gives each tile the ground noise's fill: multiply by black or screen by white, at the shade's size", () => {
    const { ctx, fills } = recordingCtx();
    makeGroundNoiseDecorator(SEED, TILE)(ctx, WORLD_PX.w, WORLD_PX.h, COAST);
    expect(fills.length).toBeGreaterThan(1000);
    for (const f of fills) {
      const shade = decor.shade[(f.y / TILE) * WORLD_WIDTH + f.x / TILE] ?? 0;
      expect(f.alpha).toBeCloseTo(Math.abs(shade), 6);
      expect([f.op, f.color]).toEqual(shade < 0 ? ["multiply", EDG.black] : ["screen", EDG.white]);
    }
    expect([decor.shadeDark, decor.shadeLight]).toEqual([EDG.black, EDG.white]);
  });

  it("gives the shore descent's bands, pixel by pixel, from each tile's edge mask", () => {
    const { ctx, fills } = recordingCtx();
    makeShoreDescentDecorator(TILE)(ctx, WORLD_PX.w, WORLD_PX.h);
    // Per pixel, the alphas the decorator multiplied in, and the ones the shader would.
    const drawn = new Map<string, number[]>();
    for (const f of fills) {
      expect([f.op, f.color]).toEqual(["multiply", EDG.skinMid]);
      for (let y = f.y; y < f.y + f.h; y++) {
        for (let x = f.x; x < f.x + f.w; x++) drawn.set(`${x},${y}`, [...(drawn.get(`${x},${y}`) ?? []), f.alpha]);
      }
    }
    const shaded = new Map<string, number[]>();
    decor.edges.forEach((mask, t) => {
      if (mask === 0) return;
      const tx = t % WORLD_WIDTH;
      const ty = (t - tx) / WORLD_WIDTH;
      for (let ly = 0; ly < TILE; ly++) {
        for (let lx = 0; lx < TILE; lx++) {
          for (const bit of [1, 2, 4, 8]) {
            if ((mask & bit) === 0) continue;
            const a = bandAlpha(bit, lx, ly);
            if (a === 0) continue;
            const key = `${tx * TILE + lx},${ty * TILE + ly}`;
            shaded.set(key, [...(shaded.get(key) ?? []), a]);
          }
        }
      }
    });
    const sorted = (m: Map<string, number[]>) => [...m].map(([k, v]) => `${k}:${v.sort().join("/")}`).sort();
    expect(drawn.size).toBeGreaterThan(10_000);
    expect(sorted(shaded)).toEqual(sorted(drawn));
    expect(decor.edgeColor).toBe(EDG.skinMid);
  });

  it("gives the water depth's speckles: the same cells, colours and alphas, by integer hash cuts", () => {
    const { ctx, fills } = recordingCtx();
    makeWaterDepthDecorator(TILE, SEED)(ctx, WORLD_PX.w, WORLD_PX.h, COAST);
    const drawn = fills.map((f) => `${f.x},${f.y},${f.w},${f.h},${f.color},${f.alpha}`).sort();
    const shaded: string[] = [];
    const sub = Math.floor(TILE / decor.specklePx);
    const ty0 = COAST.originY / TILE;
    const tx0 = COAST.originX / TILE;
    for (let ty = ty0; ty < ty0 + COAST.height / TILE; ty++) {
      for (let tx = tx0; tx < tx0 + COAST.width / TILE; tx++) {
        const cls = decor.speckleClasses[(decor.speckle[ty * WORLD_WIDTH + tx] ?? 0) - 1];
        if (!cls) continue;
        const cut = Math.ceil(cls.density * 4294967296);
        for (let sy = 0; sy < sub; sy++) {
          for (let sx = 0; sx < sub; sx++) {
            const gx = tx * sub + sx;
            const gy = ty * sub + sy;
            if (hash2(gx, gy, decor.speckleSeed) * 4294967296 >= cut) continue;
            const pickB = hash2(gx, gy, decor.speckleColorSeed) * 4294967296 >= 2147483648;
            const color = cls.colors[pickB ? 1 : 0];
            const px = decor.specklePx;
            shaded.push(`${tx * TILE + sx * px},${ty * TILE + sy * px},${px},${px},${color},${cls.alpha}`);
          }
        }
      }
    }
    expect(drawn.length).toBeGreaterThan(1000);
    expect(shaded.sort()).toEqual(drawn);
  });
});
