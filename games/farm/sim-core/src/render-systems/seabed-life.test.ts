import { describe, it, expect } from "vitest";
import { SEABED_LIFE, SEABED_LIFE_ALPHA, MIN_SPACING } from "./seabed-life";
import { SET_PIECES } from "./set-pieces";
import { isWalkable, WORLD_WIDTH, WORLD_HEIGHT } from "../world/regions";

describe("seabed life scatter", () => {
  it("places creatures on open-water tiles only (never on/adjacent to land)", () => {
    expect(SEABED_LIFE.length).toBeGreaterThan(0);
    for (const c of SEABED_LIFE) {
      expect(c.tx).toBeGreaterThanOrEqual(0);
      expect(c.ty).toBeGreaterThanOrEqual(0);
      expect(c.tx).toBeLessThan(WORLD_WIDTH);
      expect(c.ty).toBeLessThan(WORLD_HEIGHT);
      expect(isWalkable(c.tx, c.ty)).toBe(false);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(isWalkable(c.tx + dx, c.ty + dy)).toBe(false);
        }
      }
    }
  });

  it("respects the blue-noise min spacing", () => {
    for (let i = 0; i < SEABED_LIFE.length; i++) {
      for (let j = i + 1; j < SEABED_LIFE.length; j++) {
        const a = SEABED_LIFE[i]!;
        const b = SEABED_LIFE[j]!;
        const cheby = Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty));
        expect(cheby).toBeGreaterThanOrEqual(MIN_SPACING);
      }
    }
  });

  it("uses only the seabed-life frames and is semi-transparent", () => {
    expect(SEABED_LIFE_ALPHA).toBeLessThan(1);
    for (const c of SEABED_LIFE) {
      expect(c.frame.startsWith("decoration/seabed-")).toBe(true);
    }
  });

  it("does not collide with any SET_PIECES tile (distinct seeded layer)", () => {
    const occupied = new Set(SET_PIECES.map((p) => `${p.tx},${p.ty}`));
    for (const c of SEABED_LIFE) {
      expect(occupied.has(`${c.tx},${c.ty}`)).toBe(false);
    }
  });
});
