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

  it("boat grid: open over ocean (incl. under bridges), blocked on island land", () => {
    // Brief 93: boats navigate ALL open water, passing under bridges; only island
    // land blocks them. Dock/reef tiles are force-opened.
    const g = buildBoatGrid();
    const idx = (x: number, y: number) => y * WORLD_WIDTH + x;

    // Coral dock/lane/reef + port docks are open.
    for (const r of CORAL_REEFS) {
      expect(g.cells[idx(r.dock.x, r.dock.y)]).toBe(0);
      for (const l of r.lane) expect(g.cells[idx(l.x, l.y)]).toBe(0);
      expect(g.cells[idx(r.reef.x, r.reef.y)]).toBe(0);
    }
    for (const p of PORTS) expect(g.cells[idx(p.dock.x, p.dock.y)]).toBe(0);

    // The village interior (island land, not a dock) is blocked for boats.
    expect(g.cells[idx(VILLAGE.x, VILLAGE.y)]).toBe(1);

    // A map corner (open ocean) is navigable.
    expect(g.cells[idx(0, 0)]).toBe(0);
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

  it("nearestReef picks the closest reef dock (deterministic)", () => {
    // Derive expectations from the actual generated reef positions (brief 93 —
    // no hardcoded coords). A point AT each reef's dock returns that reef.
    for (const r of CORAL_REEFS) {
      expect(nearestReef(r.dock.x, r.dock.y).id).toBe(r.id);
    }
    // Deterministic + stable across calls.
    const a = nearestReef(VILLAGE.x, VILLAGE.y).id;
    const b = nearestReef(VILLAGE.x, VILLAGE.y).id;
    expect(a).toBe(b);
  });
});
