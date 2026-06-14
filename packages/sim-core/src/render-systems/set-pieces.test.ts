import { describe, it, expect } from "vitest";
import {
  SET_PIECES,
  SET_PIECE_ALPHA,
  MIN_SPACING,
  type SetPieceTile,
} from "./set-pieces";
import { CORAL } from "./geometry";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  isWalkable,
  regionAt,
} from "../world/regions";
import { CORAL_REEFS } from "../world/coral";

const key = (x: number, y: number): number => y * WORLD_WIDTH + x;

describe("set-pieces (decorative open-water props)", () => {
  it("places a sane, fixed number of props", () => {

    expect(SET_PIECES.length).toBe(28);
    expect(SET_PIECES.length).toBeGreaterThan(0);
    expect(SET_PIECE_ALPHA).toBeGreaterThan(0);
    expect(SET_PIECE_ALPHA).toBeLessThan(1);
  });

  it("is deterministic: a snapshot of the first few props is stable", () => {

    const first = SET_PIECES.slice(0, 4).map((p) => ({
      tx: p.tx,
      ty: p.ty,
      frame: p.frame,
    }));
    expect(first).toMatchInlineSnapshot(`
      [
        {
          "frame": "tile/shore-sand",
          "tx": 67,
          "ty": 77,
        },
        {
          "frame": "structure/stone",
          "tx": 167,
          "ty": 121,
        },
        {
          "frame": "structure/stone",
          "tx": 219,
          "ty": 193,
        },
        {
          "frame": "structure/stone",
          "tx": 101,
          "ty": 102,
        },
      ]
    `);
  });

  it("only uses existing atlas frames (no new frames)", () => {
    const allowed = new Set(["structure/stone", "tile/sand", "tile/shore-sand"]);
    for (const p of SET_PIECES) {
      expect(allowed.has(p.frame)).toBe(true);
    }
  });

  it("all props are within world bounds", () => {
    for (const p of SET_PIECES) {
      expect(p.tx).toBeGreaterThanOrEqual(0);
      expect(p.ty).toBeGreaterThanOrEqual(0);
      expect(p.tx).toBeLessThan(WORLD_WIDTH);
      expect(p.ty).toBeLessThan(WORLD_HEIGHT);
    }
  });

  it("REJECTION: no prop tile is walkable (not a region or road)", () => {
    for (const p of SET_PIECES) {
      expect(isWalkable(p.tx, p.ty)).toBe(false);
    }
  });

  it("REJECTION: no prop is adjacent (8-ring) to a walkable tile (off the coastline)", () => {
    for (const p of SET_PIECES) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          expect(isWalkable(p.tx + dx, p.ty + dy)).toBe(false);
        }
      }
    }
  });

  it("REJECTION: no prop overlaps a coral tile", () => {
    const coralKeys = new Set(CORAL.map((c) => key(c.tx, c.ty)));
    for (const p of SET_PIECES) {
      expect(coralKeys.has(key(p.tx, p.ty))).toBe(false);
    }
  });

  it("REJECTION: no prop sits on a reef, dock, or boat-lane tile", () => {
    const forbidden = new Set<number>();
    for (const r of CORAL_REEFS) {
      forbidden.add(key(r.dock.x, r.dock.y));
      forbidden.add(key(r.reef.x, r.reef.y));
      for (const l of r.lane) forbidden.add(key(l.x, l.y));
    }
    for (const p of SET_PIECES) {
      expect(forbidden.has(key(p.tx, p.ty))).toBe(false);
    }
  });

  it("BLUE-NOISE: no two props within Chebyshev distance MIN_SPACING", () => {
    for (let i = 0; i < SET_PIECES.length; i++) {
      for (let j = i + 1; j < SET_PIECES.length; j++) {
        const a = SET_PIECES[i] as SetPieceTile;
        const b = SET_PIECES[j] as SetPieceTile;
        const cheby = Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty));
        expect(cheby).toBeGreaterThanOrEqual(MIN_SPACING);
      }
    }
  });

  it("prop tiles are disjoint from REGIONS/ROADS (guard-test grids unaffected)", () => {

    for (const p of SET_PIECES) {
      expect(regionAt(p.tx, p.ty)).toBeNull();
      expect(isWalkable(p.tx, p.ty)).toBe(false);
    }
  });

  it("prop tiles are unique (no duplicates)", () => {
    const seen = new Set<number>();
    for (const p of SET_PIECES) {
      const k = key(p.tx, p.ty);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
});
