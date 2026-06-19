import { describe, it, expect } from "vitest";
import { OccupancyGrid, checkPlacement, rebuildWalkable } from "./occupancy";

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
