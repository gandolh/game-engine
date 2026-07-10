/**
 * Iso projection tests — the linchpin. The inverse powers all placement /
 * selection, so the round-trip identity is tested exhaustively across the grid.
 *
 * Brief 110: the projection is now built per world size by `makeIso`, so these
 * exercise it at BOTH the solo 96×96 and the MP 256×256 world, and pin the
 * property that made the old compile-time constants a bug — a projection built
 * for one world size does not describe another.
 */
import { describe, it, expect } from "vitest";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import {
  ISO_TILE_W,
  ISO_TILE_H,
  ISO_ORIGIN_Y,
  makeIso,
  isoDepth,
} from "./iso";

/** The solo world's projection — what every test below used implicitly before. */
const iso = makeIso(WORLD_WIDTH, WORLD_HEIGHT);

describe("iso constants (2:1 dimetric)", () => {
  it("width is exactly twice the height", () => {
    expect(ISO_TILE_W).toBe(2 * ISO_TILE_H);
  });
});

describe("tileToIso forward projection", () => {
  it("origin tile (0,0) lands at the X origin, Y origin", () => {
    const p = iso.tileToIso(0, 0);
    expect(p.x).toBe(iso.originX);
    expect(p.y).toBe(ISO_ORIGIN_Y);
  });

  it("+1 tileX moves down-right; +1 tileY moves down-left", () => {
    const base = iso.tileToIso(5, 5);
    const east = iso.tileToIso(6, 5); // +x: right + down
    const south = iso.tileToIso(5, 6); // +y: left + down
    expect(east.x).toBeGreaterThan(base.x);
    expect(east.y).toBeGreaterThan(base.y);
    expect(south.x).toBeLessThan(base.x);
    expect(south.y).toBeGreaterThan(base.y);
  });

  it("elevation lifts the point up the screen (-Y)", () => {
    const flat = iso.tileToIso(3, 3, 0);
    const high = iso.tileToIso(3, 3, 2);
    expect(high.y).toBeLessThan(flat.y);
    expect(high.x).toBe(flat.x);
  });

  it("keeps every grid corner within the non-negative iso world bounds", () => {
    for (const [tx, ty] of [[0, 0], [WORLD_WIDTH - 1, 0], [0, WORLD_HEIGHT - 1], [WORLD_WIDTH - 1, WORLD_HEIGHT - 1]] as const) {
      const p = iso.tileToIso(tx, ty);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(iso.worldPxW);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(iso.worldPxH);
    }
  });
});

describe("isoToTile inverse — round-trip identity (the placement-critical path)", () => {
  it("tileCenter → iso → tile recovers the exact integer tile for every cell", () => {
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        const c = iso.tileCenterToIso(tx, ty);
        const back = iso.isoToTile(c.x, c.y);
        expect(back).toEqual({ tx, ty });
      }
    }
  });

  it("continuous inverse is the exact inverse of the continuous forward", () => {
    for (let i = 0; i < 200; i++) {
      const tx = (i * 0.37) % WORLD_WIDTH;
      const ty = (i * 0.91) % WORLD_HEIGHT;
      const p = iso.tileToIso(tx, ty);
      const back = iso.isoToTileContinuous(p.x, p.y);
      expect(back.tileX).toBeCloseTo(tx, 9);
      expect(back.tileY).toBeCloseTo(ty, 9);
    }
  });

  it("points just inside a diamond's four edges resolve to that diamond", () => {
    // Sample near (but inside) each corner of a mid-grid tile's diamond.
    const tx = 10, ty = 12;
    const c = iso.tileCenterToIso(tx, ty);
    const eps = 1.5;
    const probes = [
      { x: c.x, y: c.y }, // centre
      { x: c.x + ISO_TILE_W / 2 - eps, y: c.y }, // near right point
      { x: c.x - ISO_TILE_W / 2 + eps, y: c.y }, // near left point
      { x: c.x, y: c.y + ISO_TILE_H / 2 - eps }, // near bottom
      { x: c.x, y: c.y - ISO_TILE_H / 2 + eps }, // near top
    ];
    for (const p of probes) {
      expect(iso.isoToTile(p.x, p.y)).toEqual({ tx, ty });
    }
  });
});

describe("tileDiamond", () => {
  it("returns top/right/bottom/left corners around the tile centre", () => {
    const [top, right, bottom, left] = iso.tileDiamond(4, 4) as [
      { x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number },
    ];
    const c = iso.tileCenterToIso(4, 4);
    expect(top).toEqual({ x: c.x, y: c.y - ISO_TILE_H / 2 });
    expect(right).toEqual({ x: c.x + ISO_TILE_W / 2, y: c.y });
    expect(bottom).toEqual({ x: c.x, y: c.y + ISO_TILE_H / 2 });
    expect(left).toEqual({ x: c.x - ISO_TILE_W / 2, y: c.y });
  });
});

describe("isoFootprintDiamondBox", () => {
  it("bounds a 1×1 tile's flat diamond (span = tile width, height = tile height)", () => {
    const d = iso.isoFootprintDiamondBox(7, 7, 1, 1);
    expect(d.width).toBe(ISO_TILE_W);
    expect(d.height).toBe(ISO_TILE_H);
  });
  it("a 2×2 footprint diamond spans 2× the width and height of a 1×1", () => {
    const one = iso.isoFootprintDiamondBox(0, 0, 1, 1);
    const two = iso.isoFootprintDiamondBox(0, 0, 2, 2);
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

describe("makeIso — one projection per world size (brief 110)", () => {
  const MP = 256;
  const mp = makeIso(MP, MP);

  it("derives origin + extents from the world it was built for", () => {
    expect(iso.originX).toBe((WORLD_HEIGHT - 1) * (ISO_TILE_W / 2));
    expect(mp.originX).toBe((MP - 1) * (ISO_TILE_W / 2));
    expect(mp.worldPxW).toBe((MP + MP) * (ISO_TILE_W / 2)); // 8192
    expect(mp.worldPxH).toBe((MP + MP) * (ISO_TILE_H / 2) + ISO_TILE_H); // 4112
    // Two projections coexist without disturbing each other — the reason this is
    // an object and not mutable module state.
    expect(iso.originX).not.toBe(mp.originX);
  });

  it("round-trips every corner of the 256×256 MP world", () => {
    for (const [tx, ty] of [[0, 0], [MP - 1, 0], [0, MP - 1], [MP - 1, MP - 1], [128, 128]] as const) {
      const c = mp.tileCenterToIso(tx, ty);
      expect(mp.isoToTile(c.x, c.y)).toEqual({ tx, ty });
      // …and stays inside its own non-negative extents.
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(mp.worldPxW);
      expect(c.y).toBeLessThanOrEqual(mp.worldPxH);
    }
  });

  it("regression: the MP world's centre tile falls OUTSIDE a 96×96 projection's extents", () => {
    // This is brief 108's bug, as arithmetic. The client used a 96×96 projection
    // while attached to a 256×256 sim, so the settlement at the world's own centre
    // (coreBoxCenter ⇒ ~128,128) projected below the baked terrain and off-canvas.
    const centre = iso.tileToIso(128, 128); // the WRONG (solo) projection
    expect(centre.y).toBeGreaterThan(iso.worldPxH); // off the bottom of the 96×96 world

    // The right projection puts it comfortably inside.
    const right = mp.tileToIso(128, 128);
    expect(right.y).toBeLessThan(mp.worldPxH);
    expect(right.x).toBeGreaterThanOrEqual(0);
  });
});
