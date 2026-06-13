import { describe, it, expect } from "vitest";
import {
  CLIFFS,
  CLIFF_SET,
  TALL_ISLANDS,
  BRIDGE_SET,
  COASTLINE_BUBBLE_TILES,
  oceanDepthAt,
  COAST_DEPTH_MAX,
  oceanGradientAt,
  GRADIENT_DEPTH_MAX,
  BIG_STRUCTURES,
} from "./geometry";
import { isWalkable, regionAt, WORLD_WIDTH, WORLD_HEIGHT, REGIONS } from "../world/regions";

describe("computeCliffs", () => {
  it("TALL_ISLANDS has between 3 and 5 entries", () => {
    expect(TALL_ISLANDS.length).toBeGreaterThanOrEqual(3);
    expect(TALL_ISLANDS.length).toBeLessThanOrEqual(5);
  });

  it("produces a non-empty CLIFFS array", () => {
    expect(CLIFFS.length).toBeGreaterThan(0);
  });

  it("all cliff tiles are within world bounds", () => {
    for (const c of CLIFFS) {
      expect(c.tx, `cliff tx=${c.tx} out of bounds`).toBeGreaterThanOrEqual(0);
      expect(c.tx, `cliff tx=${c.tx} out of bounds`).toBeLessThan(WORLD_WIDTH);
      expect(c.ty, `cliff ty=${c.ty} out of bounds`).toBeGreaterThanOrEqual(0);
      expect(c.ty, `cliff ty=${c.ty} out of bounds`).toBeLessThan(WORLD_HEIGHT);
    }
  });

  it("all cliff tiles are non-walkable (ocean only)", () => {
    for (const c of CLIFFS) {
      expect(
        isWalkable(c.tx, c.ty),
        `cliff at (${c.tx},${c.ty}) must be ocean (non-walkable)`,
      ).toBe(false);
    }
  });

  it("no cliff tile overlaps a bridge span (BRIDGE_SET)", () => {
    for (const c of CLIFFS) {
      const key = c.ty * WORLD_WIDTH + c.tx;
      expect(
        BRIDGE_SET.has(key),
        `cliff at (${c.tx},${c.ty}) must not overlap a bridge tile`,
      ).toBe(false);
    }
  });

  it("CLIFFS is deterministic: the set matches CLIFF_SET exactly", () => {
    const rebuiltSet = new Set(CLIFFS.map((c) => c.ty * WORLD_WIDTH + c.tx));
    expect(rebuiltSet.size).toBe(CLIFF_SET.size);
    for (const k of rebuiltSet) {
      expect(CLIFF_SET.has(k)).toBe(true);
    }
  });

  it("cliff tile positions are unique (no duplicate coordinates)", () => {
    const seen = new Set<number>();
    for (const c of CLIFFS) {
      const key = c.ty * WORLD_WIDTH + c.tx;
      expect(seen.has(key), `duplicate cliff tile at (${c.tx},${c.ty})`).toBe(false);
      seen.add(key);
    }
  });

  it("all cliff frames are valid cliff-face frame names", () => {
    const validFrames = new Set([
      "tile/cliff-face-a",
      "tile/cliff-face-b",
      "tile/cliff-face-left",
      "tile/cliff-face-right",
    ]);
    for (const c of CLIFFS) {
      expect(
        validFrames.has(c.frame),
        `unexpected cliff frame "${c.frame}" at (${c.tx},${c.ty})`,
      ).toBe(true);
    }
  });

  it("COASTLINE_BUBBLE_TILES has no cliff tile members (foam suppressed on cliffs)", () => {
    const bubbleKeys = new Set(
      COASTLINE_BUBBLE_TILES.map((b) => b.ty * WORLD_WIDTH + b.tx),
    );
    for (const c of CLIFFS) {
      const key = c.ty * WORLD_WIDTH + c.tx;
      expect(
        bubbleKeys.has(key),
        `bubble tile at (${c.tx},${c.ty}) should have been suppressed by cliff filter`,
      ).toBe(false);
    }
  });
});

describe("oceanDepthAt (coastal shallow-water bands)", () => {
  it("land tiles read 0 (untinted)", () => {

    const b = COASTLINE_BUBBLE_TILES[0]!;
    const landNbr = [
      [b.tx, b.ty - 1], [b.tx, b.ty + 1], [b.tx - 1, b.ty], [b.tx + 1, b.ty],
    ].find(([x, y]) => isWalkable(x!, y!));
    expect(landNbr, "expected a land neighbour").toBeDefined();
    expect(oceanDepthAt(landNbr![0]!, landNbr![1]!)).toBe(0);
  });

  it("ocean tiles touching land read depth 1", () => {
    for (const b of COASTLINE_BUBBLE_TILES.slice(0, 50)) {
      expect(
        oceanDepthAt(b.tx, b.ty),
        `coast-adjacent ocean (${b.tx},${b.ty}) should be depth 1`,
      ).toBe(1);
    }
  });

  it("depth is bounded to [0, COAST_DEPTH_MAX] and out-of-bounds reads 0", () => {
    for (let ty = 0; ty < WORLD_HEIGHT; ty += 7) {
      for (let tx = 0; tx < WORLD_WIDTH; tx += 7) {
        const d = oceanDepthAt(tx, ty);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(COAST_DEPTH_MAX);
      }
    }
    expect(oceanDepthAt(-1, 0)).toBe(0);
    expect(oceanDepthAt(WORLD_WIDTH, WORLD_HEIGHT)).toBe(0);
  });

  it("at least one tile reaches the max band (the rings actually extend outward)", () => {
    let sawMax = false;
    for (let ty = 0; ty < WORLD_HEIGHT && !sawMax; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (oceanDepthAt(tx, ty) === COAST_DEPTH_MAX) { sawMax = true; break; }
      }
    }
    expect(sawMax).toBe(true);
  });
});

describe("oceanGradientAt (wide shore-proximity gradient, brief 13 follow-up)", () => {
  it("land tiles return 0", () => {

    const b = COASTLINE_BUBBLE_TILES[0]!;
    const landNbr = [
      [b.tx, b.ty - 1], [b.tx, b.ty + 1], [b.tx - 1, b.ty], [b.tx + 1, b.ty],
    ].find(([x, y]) => isWalkable(x!, y!));
    expect(landNbr, "expected a land neighbour").toBeDefined();
    expect(oceanGradientAt(landNbr![0]!, landNbr![1]!)).toBe(0);
  });

  it("out-of-grid returns 0", () => {
    expect(oceanGradientAt(-1, 0)).toBe(0);
    expect(oceanGradientAt(WORLD_WIDTH, WORLD_HEIGHT)).toBe(0);
  });

  it("shore-adjacent ocean tiles return 1.0 (maximum proximity)", () => {
    for (const b of COASTLINE_BUBBLE_TILES.slice(0, 50)) {
      expect(
        oceanGradientAt(b.tx, b.ty),
        `coast-adjacent ocean (${b.tx},${b.ty}) should be 1.0`,
      ).toBe(1.0);
    }
  });

  it("all values are in [0, 1]", () => {
    for (let ty = 0; ty < WORLD_HEIGHT; ty += 5) {
      for (let tx = 0; tx < WORLD_WIDTH; tx += 5) {
        const g = oceanGradientAt(tx, ty);
        expect(g, `gradient at (${tx},${ty}) out of [0,1]`).toBeGreaterThanOrEqual(0);
        expect(g, `gradient at (${tx},${ty}) out of [0,1]`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gradient is monotone: tiles further from land are not closer to 1.0 than tiles nearer", () => {

    const b = COASTLINE_BUBBLE_TILES[0]!;

    let prev = oceanGradientAt(b.tx, b.ty);
    for (let dx = 1; dx < GRADIENT_DEPTH_MAX + 2; dx++) {
      const tx = b.tx + dx;
      if (tx >= WORLD_WIDTH) break;
      if (isWalkable(tx, b.ty)) break; 
      const cur = oceanGradientAt(tx, b.ty);
      expect(
        cur,
        `gradient at (${tx},${b.ty}) increased from prev=${prev} — should be non-increasing`,
      ).toBeLessThanOrEqual(prev + 1e-9); 
      prev = cur;
    }
  });

  it("tiles far from any land return 0 (open ocean)", () => {

    let foundDeep = false;
    for (let ty = 0; ty < WORLD_HEIGHT && !foundDeep; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (!isWalkable(tx, ty) && oceanGradientAt(tx, ty) === 0) {
          foundDeep = true;
          break;
        }
      }
    }
    expect(foundDeep, "expected at least one ocean tile with gradient=0 (far from land)").toBe(true);
  });
});

describe("BIG_STRUCTURES are anchored on their island (not floating at stale coords)", () => {

  it("every baked structure's base footprint touches a region (on land)", () => {
    for (const s of BIG_STRUCTURES) {
      const wTiles = Math.max(1, Math.round(s.wPx / 16));
      let onLand = false;
      for (let dx = 0; dx < wTiles && !onLand; dx++) {
        if (regionAt(s.baseTileX + dx, s.baseTileY) !== null) onLand = true;
      }
      expect(onLand, `${s.frame} base row (${s.baseTileX},${s.baseTileY}) is not on any region`).toBe(true);
    }
  });

  it("there is no casino building (casino is open-air)", () => {
    for (const s of BIG_STRUCTURES) {
      expect(s.frame).not.toMatch(/casino/);
    }
  });

  it("a baked structure exists on the blacksmith, carpentry, weather-station and volcano islands", () => {
    const must = ["blacksmith", "carpentry", "weather-station", "volcano"] as const;
    for (const id of must) {
      const reg = REGIONS.find((r) => r.id === id)!;
      const here = BIG_STRUCTURES.some((s) => {
        const wTiles = Math.max(1, Math.round(s.wPx / 16));
        for (let dx = 0; dx < wTiles; dx++) {
          if (regionAt(s.baseTileX + dx, s.baseTileY) === reg.id) return true;
        }
        return false;
      });
      expect(here, `expected a baked structure on ${id}`).toBe(true);
    }
  });
});
