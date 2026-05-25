import { describe, expect, it } from "vitest";
import { SpatialHashGrid } from "./hash-grid";

describe("SpatialHashGrid", () => {
  it("insert + queryAabb finds entries inside a small box", () => {
    const grid = new SpatialHashGrid({ cellSize: 10 });
    grid.insert(1, 5, 5);
    grid.insert(2, 7, 7);
    grid.insert(3, 100, 100); // way outside

    const hits = grid.queryAabb(0, 0, 10, 10);
    expect(hits).toEqual([1, 2]);
  });

  it("update moves an entry between cells (old cell no longer returns it)", () => {
    const grid = new SpatialHashGrid({ cellSize: 10 });
    grid.insert(42, 5, 5); // cell (0,0)

    expect(grid.queryAabb(0, 0, 9, 9)).toEqual([42]);

    grid.update(42, 55, 55); // cell (5,5)

    // old cell should not return it
    expect(grid.queryAabb(0, 0, 9, 9)).toEqual([]);
    // new cell does
    expect(grid.queryAabb(50, 50, 59, 59)).toEqual([42]);
  });

  it("update within the same cell still updates coordinates", () => {
    const grid = new SpatialHashGrid({ cellSize: 10 });
    grid.insert(1, 1, 1);
    grid.update(1, 9, 9); // still in cell (0,0)

    expect(grid.queryAabb(0, 0, 9, 9)).toEqual([1]);
    // narrow box around new position
    expect(grid.queryAabb(8, 8, 10, 10)).toEqual([1]);
    // narrow box around old position should miss
    expect(grid.queryAabb(0, 0, 2, 2)).toEqual([]);
  });

  it("queryAabb spanning many cells returns sorted-by-id results", () => {
    const grid = new SpatialHashGrid({ cellSize: 10 });
    // insert in reverse-id order across multiple cells
    grid.insert(5, 5, 5);
    grid.insert(3, 25, 5);
    grid.insert(8, 45, 35);
    grid.insert(1, 65, 65);
    grid.insert(7, 5, 65);
    grid.insert(2, 95, 95); // outside the query box

    const hits = grid.queryAabb(0, 0, 70, 70);
    expect(hits).toEqual([1, 3, 5, 7, 8]);
    // assert strictly ascending
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!).toBeGreaterThan(hits[i - 1]!);
    }
  });

  it("queryCircle excludes entries outside the radius", () => {
    const grid = new SpatialHashGrid({ cellSize: 10 });
    grid.insert(1, 0, 0);
    grid.insert(2, 3, 4); // distance 5
    grid.insert(3, 6, 8); // distance 10
    grid.insert(4, 10, 10); // distance ~14.14

    const hits = grid.queryCircle(0, 0, 5);
    expect(hits).toEqual([1, 2]);

    const wider = grid.queryCircle(0, 0, 10);
    expect(wider).toEqual([1, 2, 3]);
  });

  it("remove drops the entry", () => {
    const grid = new SpatialHashGrid({ cellSize: 10 });
    grid.insert(1, 5, 5);
    grid.insert(2, 6, 6);
    grid.remove(1);
    expect(grid.queryAabb(0, 0, 10, 10)).toEqual([2]);
    expect(grid.size).toBe(1);
    // removing unknown is a no-op
    grid.remove(999);
    expect(grid.size).toBe(1);
  });

  it("clear drops everything", () => {
    const grid = new SpatialHashGrid({ cellSize: 10 });
    grid.insert(1, 5, 5);
    grid.insert(2, 50, 50);
    grid.clear();
    expect(grid.size).toBe(0);
    expect(grid.queryAabb(-1000, -1000, 1000, 1000)).toEqual([]);
  });

  it("insert throws on duplicate id", () => {
    const grid = new SpatialHashGrid({ cellSize: 10 });
    grid.insert(1, 5, 5);
    expect(() => grid.insert(1, 6, 6)).toThrow(/already inserted/);
  });

  it("handles negative coordinates", () => {
    const grid = new SpatialHashGrid({ cellSize: 10 });
    grid.insert(1, -5, -5);
    grid.insert(2, -15, -15);
    grid.insert(3, 5, 5);

    expect(grid.queryAabb(-20, -20, 0, 0)).toEqual([1, 2]);
    expect(grid.queryAabb(-10, -10, 10, 10)).toEqual([1, 3]);
  });

  it("constructor rejects non-positive cellSize", () => {
    expect(() => new SpatialHashGrid({ cellSize: 0 })).toThrow();
    expect(() => new SpatialHashGrid({ cellSize: -1 })).toThrow();
    expect(() => new SpatialHashGrid({ cellSize: NaN })).toThrow();
  });
});
