
import { describe, it, expect, beforeEach } from "vitest";
import { JsPathfinder } from "./js-pathfinder";
import { buildBoatGrid, CORAL_REEFS } from "./coral";
import { buildWalkableGrid } from "./walkable-grid";
import { WORLD_WIDTH, setActiveWorld, generateWorld, WORLD_GEN_SEED, type GeneratedWorld } from "./regions";
import { PORTS, portLaneTiles, isPortDockTile, nearestPort, portAtDockTile } from "./ports";

describe("port network geometry", () => {
  // Pin the default world at TEST time (not collection time) so this suite is
  // independent of run order — another file may install a runtime world via
  // setActiveWorld/bootstrapSim, and grids must be built against the same world
  // the lazy port/lane derivations see.
  // beforeEach (not beforeAll): vitest runs sim-core with isolate:false, so the
  // shared world singleton can be swapped by another file BETWEEN this suite's
  // tests. Re-pin + rebuild grids before EVERY test so each is self-consistent.
  let land: ReturnType<typeof buildWalkableGrid>;
  let boat: ReturnType<typeof buildBoatGrid>;
  beforeEach(() => {
    const w: GeneratedWorld = generateWorld(WORLD_GEN_SEED);
    setActiveWorld(w);
    land = buildWalkableGrid();
    boat = buildBoatGrid();
  });
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
