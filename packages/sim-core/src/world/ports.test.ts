/**
 * Port-to-port boat network (todo: island-ports-boat-travel).
 *
 * Geometry is the load-bearing part, so assert it directly (instant — no sim run):
 *   1. Every ocean lane tile is genuinely ocean (also enforced by the module-load
 *      guard, but pinned here as a regression test against world-geometry drift).
 *   2. Dock tiles are LAND on the walkable grid (a farmer reaches them on foot)
 *      and OPEN on the boat grid (a boarded farmer can leave the island).
 *   3. The boat grid is connected: the pathfinder finds a port→port route along
 *      the lanes for every ordered pair of ports (this IS "travel along a water
 *      lane to another port").
 *   4. The coral stubs still pathfind on the same (unioned) boat grid.
 */
import { describe, it, expect } from "vitest";
import { JsPathfinder } from "./js-pathfinder";
import { buildBoatGrid, CORAL_REEFS } from "./coral";
import { buildWalkableGrid } from "./walkable-grid";
import { WORLD_WIDTH } from "./regions";
import { PORTS, portLaneTiles, isPortDockTile, nearestPort, portAtDockTile } from "./ports";

describe("port network geometry", () => {
  const land = buildWalkableGrid();
  const boat = buildBoatGrid();
  const isOceanOnLand = (x: number, y: number) => land.cells[y * land.width + x] === 1;
  const isOpenOnBoat = (x: number, y: number) => boat.cells[y * boat.width + x] === 0;

  it("every lane tile is ocean (blocked on the land grid)", () => {
    for (const t of portLaneTiles()) {
      expect(isOceanOnLand(t.x, t.y), `lane tile (${t.x},${t.y}) must be ocean`).toBe(true);
    }
  });

  it("dock tiles are land on foot and open on the boat grid", () => {
    for (const p of PORTS) {
      expect(isOceanOnLand(p.dock.x, p.dock.y), `${p.id} dock must be reachable land`).toBe(false);
      expect(isOpenOnBoat(p.dock.x, p.dock.y), `${p.id} dock must be open on boat grid`).toBe(true);
      expect(isPortDockTile(p.dock.x, p.dock.y)).toBe(true);
      expect(portAtDockTile(p.dock.x, p.dock.y)?.id).toBe(p.id);
    }
  });

  it("the boat grid connects every ordered pair of ports", () => {
    const pf = new JsPathfinder();
    for (const a of PORTS) {
      for (const b of PORTS) {
        if (a.id === b.id) continue;
        const path = pf.findPath(boat, a.dock, b.dock);
        expect(path.length, `no boat route ${a.id} → ${b.id}`).toBeGreaterThan(1);
      }
    }
  });

  it("the coral dock→reef stubs still pathfind on the unioned boat grid", () => {
    const pf = new JsPathfinder();
    for (const r of CORAL_REEFS) {
      const path = pf.findPath(boat, r.dock, r.reef);
      expect(path.length, `coral ${r.id} dock→reef route lost`).toBeGreaterThan(1);
    }
  });

  it("nearestPort picks the Manhattan-closest dock, tie-broken by id", () => {
    const p = PORTS[0]!;
    expect(nearestPort(p.dock.x, p.dock.y).id).toBe(p.id);
  });

  it("WORLD_WIDTH sanity (grid is 240-wide)", () => {
    expect(WORLD_WIDTH).toBe(240);
  });
});
