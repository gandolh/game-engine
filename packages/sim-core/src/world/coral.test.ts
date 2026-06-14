import { describe, it, expect } from "vitest";
import {
  buildBoatGrid,
  CORAL_REEFS,
  isCoralReefTile,
  isDockTile,
  nearestReef,
} from "./coral";
import { buildWalkableGrid } from "./walkable-grid";
import { PORTS, portLaneTiles } from "./ports";
import { WORLD_WIDTH, WORLD_HEIGHT, isWalkable, REGIONS, ROADS, getRegion, forEachLandTile } from "./regions";

const VILLAGE = getRegion("village").center; 

describe("coral geography + boat grid", () => {
  it("reef + lane tiles sit on open OCEAN (not land/road)", () => {

    for (const r of CORAL_REEFS) {
      expect(isWalkable(r.reef.x, r.reef.y)).toBe(false); 
      for (const l of r.lane) expect(isWalkable(l.x, l.y)).toBe(false); 
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

  it("boat grid is walkable ONLY on the coral dock+lane+reef tiles + the port network", () => {
    const g = buildBoatGrid();
    const idx = (x: number, y: number) => y * WORLD_WIDTH + x;

    const open = new Set<number>();
    for (const r of CORAL_REEFS) {
      open.add(idx(r.dock.x, r.dock.y));
      for (const l of r.lane) open.add(idx(l.x, l.y));
      open.add(idx(r.reef.x, r.reef.y));
    }
    for (const p of PORTS) open.add(idx(p.dock.x, p.dock.y));
    for (const t of portLaneTiles()) open.add(idx(t.x, t.y));

    let walkable = 0;
    for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === 0) walkable++;
    expect(walkable).toBe(open.size);

    const r0 = CORAL_REEFS[0]!;
    expect(g.cells[idx(r0.dock.x, r0.dock.y)]).toBe(0);
    for (const l of r0.lane) expect(g.cells[idx(l.x, l.y)]).toBe(0);
    expect(g.cells[idx(r0.reef.x, r0.reef.y)]).toBe(0);

    expect(g.cells[idx(VILLAGE.x, VILLAGE.y)]).toBe(1);
  });

  it("the LAND walkable grid is exactly REGIONS + ROADS — no coral leakage", () => {

    const expected = new Set<number>();
    const mark = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
      for (let y = b.minY; y <= b.maxY; y++) {
        for (let x = b.minX; x <= b.maxX; x++) expected.add(y * WORLD_WIDTH + x);
      }
    };
    // Regions are organic masks now — only the land tiles count (matches
    // buildWalkableGrid, which fills via forEachLandTile). Roads stay rects.
    for (const r of REGIONS) forEachLandTile(r, (x, y) => expected.add(y * WORLD_WIDTH + x));
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
    expect(isCoralReefTile(VILLAGE.x, VILLAGE.y)).toBe(false); 
  });

  it("nearestReef picks by dock proximity, deterministic tie-break by id", () => {

    expect(nearestReef(80, 150).id).toBe("reef-forest");
    expect(nearestReef(130, 150).id).toBe("reef-mill");
  });
});
