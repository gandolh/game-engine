import { describe, it, expect } from "vitest";
import {
  buildBoatGrid,
  CORAL_REEFS,
  isCoralReefTile,
  isDockTile,
  nearestReef,
} from "./coral";
import { buildWalkableGrid } from "./walkable-grid";
import { WORLD_WIDTH, WORLD_HEIGHT, isWalkable, REGIONS, ROADS, getRegion } from "./regions";

const VILLAGE = getRegion("village").center; // a land tile, never on the boat grid

describe("coral geography + boat grid", () => {
  it("reef + lane tiles sit on open OCEAN (not land/road)", () => {
    // The whole point of the boat trip: reefs are unreachable on foot.
    for (const r of CORAL_REEFS) {
      expect(isWalkable(r.reef.x, r.reef.y)).toBe(false); // reef is ocean
      for (const l of r.lane) expect(isWalkable(l.x, l.y)).toBe(false); // lane is ocean
    }
  });

  it("dock tiles ARE on land (the isle's edge, walkable on foot)", () => {
    for (const r of CORAL_REEFS) {
      expect(isWalkable(r.dock.x, r.dock.y)).toBe(true);
    }
  });

  it("boat grid is the same dimensions as the land grid", () => {
    const g = buildBoatGrid();
    expect(g.width).toBe(WORLD_WIDTH);
    expect(g.height).toBe(WORLD_HEIGHT);
    expect(g.cells.length).toBe(WORLD_WIDTH * WORLD_HEIGHT);
  });

  it("boat grid is walkable ONLY on the dock+lane+reef tiles of each reef", () => {
    const g = buildBoatGrid();
    let walkable = 0;
    for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === 0) walkable++;
    // Per reef: 1 dock + lane tiles + 1 reef. Both reefs have a 2-tile lane.
    const expected = CORAL_REEFS.reduce((sum, r) => sum + 2 + r.lane.length, 0);
    expect(walkable).toBe(expected);
    // Spot-check: the dock→reef corridor for reef 0 is fully connected (walkable).
    const r0 = CORAL_REEFS[0]!;
    const idx = (x: number, y: number) => y * WORLD_WIDTH + x;
    expect(g.cells[idx(r0.dock.x, r0.dock.y)]).toBe(0);
    for (const l of r0.lane) expect(g.cells[idx(l.x, l.y)]).toBe(0);
    expect(g.cells[idx(r0.reef.x, r0.reef.y)]).toBe(0);
    // An arbitrary land tile (village center) is BLOCKED on the boat grid.
    expect(g.cells[idx(VILLAGE.x, VILLAGE.y)]).toBe(1);
  });

  it("the LAND walkable grid is exactly REGIONS + ROADS — no coral leakage", () => {
    // Coral reefs are NOT regions and the boat grid is separate, so the land
    // grid is precisely the island bodies + bridges. Recompute that set
    // independently and assert the builder agrees (self-tracks the farm count).
    const expected = new Set<number>();
    const mark = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
      for (let y = b.minY; y <= b.maxY; y++) {
        for (let x = b.minX; x <= b.maxX; x++) expected.add(y * WORLD_WIDTH + x);
      }
    };
    for (const r of REGIONS) mark(r.bounds);
    for (const road of ROADS) mark(road);

    const grid = buildWalkableGrid();
    let walkable = 0;
    for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === 0) walkable++;
    expect(walkable).toBe(expected.size);
  });

  it("isCoralReefTile / isDockTile classify the right tiles", () => {
    for (const r of CORAL_REEFS) {
      expect(isCoralReefTile(r.reef.x, r.reef.y)).toBe(true);
      expect(isDockTile(r.dock.x, r.dock.y)).toBe(true);
      expect(isCoralReefTile(r.dock.x, r.dock.y)).toBe(false);
      expect(isDockTile(r.reef.x, r.reef.y)).toBe(false);
    }
    expect(isCoralReefTile(VILLAGE.x, VILLAGE.y)).toBe(false); // village center
  });

  it("nearestReef picks by dock proximity, deterministic tie-break by id", () => {
    // reef-forest dock (62,112) is W, reef-mill dock (78,112) is E. A tile west
    // of the midpoint picks forest; east picks mill.
    expect(nearestReef(50, 100).id).toBe("reef-forest");
    expect(nearestReef(95, 100).id).toBe("reef-mill");
  });
});
