// The terrain's static-layer bake on patches. Citadel's iso world (6144 px wide at
// 192×192) is past one texture, so the engine bakes it patch by patch and hands the
// decorator each patch's iso rect. These replace the old re-baking window's tests:
// what has to hold now is that a patch paints every diamond that reaches it, in the
// whole-world order, and nothing far from it.
import { describe, it, expect } from "vitest";
import type { Ctx2D, StaticRegion } from "@engine/core";
import { SINGLE_TEXTURE_MAX } from "@engine/core/render";
import type { TerrainGrid } from "@citadel/sim-core";
import { makeIso, ISO_HW, ISO_HH } from "./iso";
import type { IsoProjection } from "./iso";
import { makeTerrainDecorate, regionTiles } from "./terrain-dither";

function terrain(tilesW: number, tilesH: number): TerrainGrid {
  const cells = new Uint8Array(tilesW * tilesH);
  for (let i = 0; i < cells.length; i++) cells[i] = i % 3;
  return { cells, width: tilesW, height: tilesH };
}

/** A 2D context that records the top vertex of every diamond filled, in order. */
function recordingCtx(): { ctx: Ctx2D; diamonds: string[] } {
  const diamonds: string[] = [];
  let first: string | null = null;
  const ctx = {
    fillStyle: "",
    beginPath: () => {
      first = null;
    },
    moveTo: (x: number, y: number) => {
      first = `${x},${y}`;
    },
    lineTo: () => {},
    closePath: () => {},
    fill: () => {
      if (first) diamonds.push(first);
    },
    fillRect: () => {},
  } as unknown as Ctx2D;
  return { ctx, diamonds };
}

/** Top vertices of the diamonds whose bounding box overlaps `r`. */
function diamondsBoxing(iso: IsoProjection, w: number, h: number, r: StaticRegion): Set<string> {
  const out = new Set<string>();
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const c = iso.tileCenterToIso(tx, ty);
      if (
        c.x + ISO_HW > r.originX &&
        c.x - ISO_HW < r.originX + r.width &&
        c.y + ISO_HH > r.originY &&
        c.y - ISO_HH < r.originY + r.height
      ) {
        const top = iso.tileDiamond(tx, ty)[0]!;
        out.add(`${top.x},${top.y}`);
      }
    }
  }
  return out;
}

/** Top vertices of the diamonds that own the pixels of `r` (sampled every 2 px). */
function diamondsUnder(iso: IsoProjection, w: number, h: number, r: StaticRegion): Set<string> {
  const out = new Set<string>();
  for (let y = r.originY; y < r.originY + r.height; y += 2) {
    for (let x = r.originX; x < r.originX + r.width; x += 2) {
      const c = iso.isoToTileContinuous(x, y);
      const tx = Math.floor(c.tileX);
      const ty = Math.floor(c.tileY);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const top = iso.tileDiamond(tx, ty)[0]!;
      out.add(`${top.x},${top.y}`);
    }
  }
  return out;
}

describe("Citadel's terrain bake on patches", () => {
  const N = 40;
  const iso = makeIso(N, N);
  const grid = terrain(N, N);
  const wholeWorld: StaticRegion = { originX: 0, originY: 0, width: iso.worldPxW, height: iso.worldPxH };

  it("is past one texture at the shipped sizes, so the engine patches it", () => {
    expect(makeIso(192, 192).worldPxW).toBeGreaterThan(SINGLE_TEXTURE_MAX);
    expect(makeIso(256, 256).worldPxW).toBeGreaterThan(SINGLE_TEXTURE_MAX);
  });

  it("the whole world paints every tile", () => {
    const { ctx, diamonds } = recordingCtx();
    makeTerrainDecorate(iso, grid)(ctx, iso.worldPxW, iso.worldPxH, wholeWorld);
    expect(diamonds).toHaveLength(N * N);
  });

  it("a patch paints the diamond under every one of its pixels, and none whose box misses it", () => {
    const patch: StaticRegion = { originX: 256, originY: 128, width: 256, height: 256 };
    const { ctx, diamonds } = recordingCtx();
    makeTerrainDecorate(iso, grid)(ctx, iso.worldPxW, iso.worldPxH, patch);
    const painted = new Set(diamonds);
    for (const d of diamondsUnder(iso, N, N, patch)) expect(painted.has(d), d).toBe(true);
    const boxing = diamondsBoxing(iso, N, N, patch);
    for (const d of painted) expect(boxing.has(d), d).toBe(true);
    expect(painted.size).toBeLessThan(N * N);
  });

  it("paints in the whole-world order, so a diamond across a patch edge comes out the same on both sides", () => {
    const whole = recordingCtx();
    makeTerrainDecorate(iso, grid)(whole.ctx, iso.worldPxW, iso.worldPxH, wholeWorld);
    const patch: StaticRegion = { originX: 512, originY: 256, width: 128, height: 128 };
    const part = recordingCtx();
    makeTerrainDecorate(iso, grid)(part.ctx, iso.worldPxW, iso.worldPxH, patch);
    const inPatch = new Set(part.diamonds);
    expect(whole.diamonds.filter((d) => inPatch.has(d))).toEqual(part.diamonds);
  });

  it("regionTiles takes a tile of margin round the rect's own tiles", () => {
    const c = iso.tileCenterToIso(10, 10);
    // The rect sits inside tile 10; floor/ceil of its corners give 10..11, padded by one.
    expect(regionTiles(iso, { originX: c.x - 1, originY: c.y - 1, width: 2, height: 2 })).toEqual({
      minTx: 9,
      minTy: 9,
      maxTx: 12,
      maxTy: 12,
    });
  });
});
