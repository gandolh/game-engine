import { describe, it, expect } from "vitest";
import { OccupancyGrid, checkPlacement, rebuildWalkable, patchWalkable } from "./occupancy";

describe("OccupancyGrid", () => {
  it("starts fully free", () => {
    const occ = new OccupancyGrid(10, 10);
    expect(occ.isOccupied(5, 5)).toBe(false);
  });

  it("apply marks footprint tiles occupied", () => {
    const occ = new OccupancyGrid(10, 10);
    occ.apply({ x: 2, y: 3, w: 2, h: 2 });
    expect(occ.isOccupied(2, 3)).toBe(true);
    expect(occ.isOccupied(3, 3)).toBe(true);
    expect(occ.isOccupied(2, 4)).toBe(true);
    expect(occ.isOccupied(3, 4)).toBe(true);
    expect(occ.isOccupied(4, 3)).toBe(false); // adjacent
  });

  it("remove clears footprint tiles", () => {
    const occ = new OccupancyGrid(10, 10);
    occ.apply({ x: 2, y: 3, w: 2, h: 2 });
    occ.remove({ x: 2, y: 3, w: 2, h: 2 });
    expect(occ.isOccupied(2, 3)).toBe(false);
  });

  it("out-of-bounds is treated as occupied", () => {
    const occ = new OccupancyGrid(10, 10);
    expect(occ.isOccupied(-1, 0)).toBe(true);
    expect(occ.isOccupied(10, 0)).toBe(true);
  });
});

describe("checkPlacement", () => {
  it("allows valid placement on free grass tiles", () => {
    const occ = new OccupancyGrid(10, 10);
    const result = checkPlacement({ x: 2, y: 2, w: 2, h: 2 }, occ, () => true);
    expect(result.valid).toBe(true);
  });

  it("rejects out-of-bounds", () => {
    const occ = new OccupancyGrid(10, 10);
    const result = checkPlacement({ x: 9, y: 9, w: 2, h: 2 }, occ, () => true);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("out of bounds");
  });

  it("rejects occupied tiles", () => {
    const occ = new OccupancyGrid(10, 10);
    occ.apply({ x: 2, y: 2, w: 2, h: 2 });
    const result = checkPlacement({ x: 3, y: 3, w: 2, h: 2 }, occ, () => true);
    expect(result.valid).toBe(false);
  });

  it("rejects non-buildable terrain", () => {
    const occ = new OccupancyGrid(10, 10);
    const result = checkPlacement({ x: 0, y: 0, w: 2, h: 2 }, occ, () => false);
    expect(result.valid).toBe(false);
  });
});

describe("rebuildWalkable", () => {
  it("occupied tiles are non-walkable even on walkable terrain", () => {
    const occ = new OccupancyGrid(4, 4);
    occ.apply({ x: 1, y: 1, w: 2, h: 2 });
    const walkable = rebuildWalkable(4, 4, occ, () => true);
    expect(walkable[1 * 4 + 1]).toBe(0); // occupied
    expect(walkable[0 * 4 + 0]).toBe(1); // free grass
  });

  it("non-walkable terrain is blocked regardless of occupancy", () => {
    const occ = new OccupancyGrid(4, 4);
    const walkable = rebuildWalkable(4, 4, occ, (tx) => tx !== 2);
    expect(walkable[0 * 4 + 2]).toBe(0); // water column
    expect(walkable[0 * 4 + 0]).toBe(1); // grass
  });
});

describe("patchWalkable (audit-10: in-place footprint patch)", () => {
  it("patches only the footprint's cells, leaving the rest of the buffer untouched", () => {
    const occ = new OccupancyGrid(6, 6);
    const walkable = rebuildWalkable(6, 6, occ, () => true); // all walkable initially
    const before = Array.from(walkable);

    occ.apply({ x: 2, y: 2, w: 2, h: 2 });
    patchWalkable(walkable, occ, { x: 2, y: 2, w: 2, h: 2 }, () => true);

    for (let ty = 0; ty < 6; ty++) {
      for (let tx = 0; tx < 6; tx++) {
        const idx = ty * 6 + tx;
        const inFootprint = tx >= 2 && tx < 4 && ty >= 2 && ty < 4;
        if (inFootprint) {
          expect(walkable[idx]).toBe(0); // now occupied
        } else {
          expect(walkable[idx]).toBe(before[idx]); // untouched
        }
      }
    }
  });

  it("returns the SAME array identity — it patches in place, never allocates", () => {
    const occ = new OccupancyGrid(6, 6);
    const walkable = rebuildWalkable(6, 6, occ, () => true);
    occ.apply({ x: 0, y: 0, w: 1, h: 1 });
    patchWalkable(walkable, occ, { x: 0, y: 0, w: 1, h: 1 }, () => true);
    expect(walkable[0]).toBe(0);
  });

  it("is equivalent to a full rebuildWalkable for the footprint it covers", () => {
    const occ = new OccupancyGrid(8, 8);
    const walkable = rebuildWalkable(8, 8, occ, (tx, ty) => (tx + ty) % 3 !== 0);
    occ.apply({ x: 3, y: 3, w: 3, h: 2 });
    patchWalkable(walkable, occ, { x: 3, y: 3, w: 3, h: 2 }, (tx, ty) => (tx + ty) % 3 !== 0);

    const oracle = rebuildWalkable(8, 8, occ, (tx, ty) => (tx + ty) % 3 !== 0);
    expect(Array.from(walkable)).toEqual(Array.from(oracle));
  });

  it("clamps out-of-bounds footprint cells rather than throwing or corrupting memory", () => {
    const occ = new OccupancyGrid(4, 4);
    const walkable = rebuildWalkable(4, 4, occ, () => true);
    expect(() => patchWalkable(walkable, occ, { x: -1, y: -1, w: 2, h: 2 }, () => true)).not.toThrow();
    expect(walkable.length).toBe(16);
  });
});
