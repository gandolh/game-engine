/**
 * Iso projection tests — the linchpin. The inverse powers all placement /
 * selection, so the round-trip identity is tested exhaustively across the grid.
 */
import { describe, it, expect } from "vitest";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import {
  ISO_TILE_W,
  ISO_TILE_H,
  ISO_ORIGIN_X,
  ISO_ORIGIN_Y,
  ISO_WORLD_W,
  ISO_WORLD_H,
  tileToIso,
  tileCenterToIso,
  isoToTileContinuous,
  isoToTile,
  tileDiamond,
  isoDepth,
  isoFootprintDiamondBox,
} from "./iso";

describe("iso constants (2:1 dimetric)", () => {
  it("width is exactly twice the height", () => {
    expect(ISO_TILE_W).toBe(2 * ISO_TILE_H);
  });
});

describe("tileToIso forward projection", () => {
  it("origin tile (0,0) lands at the X origin, Y origin", () => {
    const p = tileToIso(0, 0);
    expect(p.x).toBe(ISO_ORIGIN_X);
    expect(p.y).toBe(ISO_ORIGIN_Y);
  });

  it("+1 tileX moves down-right; +1 tileY moves down-left", () => {
    const base = tileToIso(5, 5);
    const east = tileToIso(6, 5); // +x: right + down
    const south = tileToIso(5, 6); // +y: left + down
    expect(east.x).toBeGreaterThan(base.x);
    expect(east.y).toBeGreaterThan(base.y);
    expect(south.x).toBeLessThan(base.x);
    expect(south.y).toBeGreaterThan(base.y);
  });

  it("elevation lifts the point up the screen (-Y)", () => {
    const flat = tileToIso(3, 3, 0);
    const high = tileToIso(3, 3, 2);
    expect(high.y).toBeLessThan(flat.y);
    expect(high.x).toBe(flat.x);
  });

  it("keeps every grid corner within the non-negative iso world bounds", () => {
    for (const [tx, ty] of [[0, 0], [WORLD_WIDTH - 1, 0], [0, WORLD_HEIGHT - 1], [WORLD_WIDTH - 1, WORLD_HEIGHT - 1]] as const) {
      const p = tileToIso(tx, ty);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(ISO_WORLD_W);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(ISO_WORLD_H);
    }
  });
});

describe("isoToTile inverse — round-trip identity (the placement-critical path)", () => {
  it("tileCenter → iso → tile recovers the exact integer tile for every cell", () => {
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        const c = tileCenterToIso(tx, ty);
        const back = isoToTile(c.x, c.y);
        expect(back).toEqual({ tx, ty });
      }
    }
  });

  it("continuous inverse is the exact inverse of the continuous forward", () => {
    for (let i = 0; i < 200; i++) {
      const tx = (i * 0.37) % WORLD_WIDTH;
      const ty = (i * 0.91) % WORLD_HEIGHT;
      const p = tileToIso(tx, ty);
      const back = isoToTileContinuous(p.x, p.y);
      expect(back.tileX).toBeCloseTo(tx, 9);
      expect(back.tileY).toBeCloseTo(ty, 9);
    }
  });

  it("points just inside a diamond's four edges resolve to that diamond", () => {
    // Sample near (but inside) each corner of a mid-grid tile's diamond.
    const tx = 10, ty = 12;
    const c = tileCenterToIso(tx, ty);
    const eps = 1.5;
    const probes = [
      { x: c.x, y: c.y }, // centre
      { x: c.x + ISO_TILE_W / 2 - eps, y: c.y }, // near right point
      { x: c.x - ISO_TILE_W / 2 + eps, y: c.y }, // near left point
      { x: c.x, y: c.y + ISO_TILE_H / 2 - eps }, // near bottom
      { x: c.x, y: c.y - ISO_TILE_H / 2 + eps }, // near top
    ];
    for (const p of probes) {
      expect(isoToTile(p.x, p.y)).toEqual({ tx, ty });
    }
  });
});

describe("tileDiamond", () => {
  it("returns top/right/bottom/left corners around the tile centre", () => {
    const [top, right, bottom, left] = tileDiamond(4, 4) as [
      { x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number },
    ];
    const c = tileCenterToIso(4, 4);
    expect(top).toEqual({ x: c.x, y: c.y - ISO_TILE_H / 2 });
    expect(right).toEqual({ x: c.x + ISO_TILE_W / 2, y: c.y });
    expect(bottom).toEqual({ x: c.x, y: c.y + ISO_TILE_H / 2 });
    expect(left).toEqual({ x: c.x - ISO_TILE_W / 2, y: c.y });
  });
});

describe("isoFootprintDiamondBox", () => {
  it("bounds a 1×1 tile's flat diamond (span = tile width, height = tile height)", () => {
    const d = isoFootprintDiamondBox(7, 7, 1, 1);
    expect(d.width).toBe(ISO_TILE_W);
    expect(d.height).toBe(ISO_TILE_H);
  });
  it("a 2×2 footprint diamond spans 2× the width and height of a 1×1", () => {
    const one = isoFootprintDiamondBox(0, 0, 1, 1);
    const two = isoFootprintDiamondBox(0, 0, 2, 2);
    expect(two.width).toBe(one.width * 2);
    expect(two.height).toBe(one.height * 2);
  });
});

describe("isoDepth painter's order", () => {
  it("a tile further down-screen sorts after one above it", () => {
    expect(isoDepth(5, 5)).toBeGreaterThan(isoDepth(4, 4));
    expect(isoDepth(0, 9)).toBeGreaterThan(isoDepth(0, 0));
  });
  it("elevation breaks ties (a taller object on the same row sorts later)", () => {
    expect(isoDepth(3, 3, 1)).toBeGreaterThan(isoDepth(3, 3, 0));
  });
});
