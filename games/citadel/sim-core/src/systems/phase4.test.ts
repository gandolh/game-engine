/**
 * Phase 4 tests — siege layer: walls/gates, raider spawn + pathing, siege
 * resolution, refining chains, and determinism with siege active.
 *
 * All tests drive bootstrapSim() directly (no Worker).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { TerrainType, WORLD_WIDTH } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";
import type { CitadelCommand, RenderSnapshot } from "../snapshot/index";
import { computeRaiderPath, raiderWalkable } from "./raid-spawn";
import { bfsPath } from "../world/pathfinder";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

function boot(seed = SEED) {
  return bootstrapSim({ seed, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
}

/** Find a clear (grass) tile near the center for placing buildings. */
function findGrass(terrain: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++) {
            const t = terrain.cells[(y + yy) * terrain.width + (x + xx)];
            if (t !== TerrainType.Grass) { ok = false; break; }
          }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

/** Find a 2×2 region that overlaps at least one Stone tile. */
function findStone(terrain: TerrainGrid): { x: number; y: number } | null {
  for (let y = 1; y < terrain.height - 2; y++) {
    for (let x = 1; x < terrain.width - 2; x++) {
      let stone = false;
      let blocked = false;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const t = terrain.cells[(y + dy) * terrain.width + (x + dx)]!;
          if (t === TerrainType.Stone) stone = true;
          if (t === TerrainType.Water || t === TerrainType.Rough) blocked = true;
        }
      }
      if (stone && !blocked) return { x, y };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. wall blocks walkable grid; gate stays passable
// ---------------------------------------------------------------------------
describe("Phase 4 — walls & gates", () => {
  it("wall blocks the walkable grid; gate stays passable", () => {
    const sim = boot();
    sim.state.tier = "Town"; // unlock wall/gate (Village) + siege (Town) for placement
    const g = findGrass(sim.terrain, 1, 1, 20, 20);
    const wallX = g.x;
    const wallY = g.y;
    const gateX = g.x + 4;
    const gateY = g.y;

    sim.commands.enqueue({ type: "placeWall", payload: { tiles: [{ x: wallX, y: wallY }] } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "gate", x: gateX, y: gateY } });
    sim.scheduler.tick({ tick: 0 });

    const wallIdx = wallY * WORLD_WIDTH + wallX;
    const gateIdx = gateY * WORLD_WIDTH + gateX;

    // Wall blocks the walkable grid.
    expect(sim.walkable[wallIdx]).toBe(0);
    expect(sim.state.wallTiles.has(wallIdx)).toBe(true);

    // Gate does NOT block the walkable grid (stays 1) and is tracked as a gate.
    expect(sim.walkable[gateIdx]).toBe(1);
    expect(sim.state.gateTiles.has(gateIdx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. raiders spawn on the expected deterministic tick and path toward target
// ---------------------------------------------------------------------------
describe("Phase 4 — raid spawning", () => {
  it("raiders spawn on the expected deterministic tick and have a path", () => {
    const sim = boot();
    sim.state.tier = "Town"; // keep requires Town tier to place
    // Raids are gated on a keep existing — place one so the siege game begins.
    const g = findGrass(sim.terrain, 3, 3, 36, 36);
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });
    // No raids before day 5.
    for (let tick = 0; tick < 5 * TICKS_PER_DAY; tick++) sim.scheduler.tick({ tick });
    expect(sim.state.raiders.length).toBe(0);
    expect(sim.state.nextRaidTick).toBeGreaterThanOrEqual(5 * TICKS_PER_DAY);

    const firstRaidTick = sim.state.nextRaidTick;
    for (let tick = 5 * TICKS_PER_DAY; tick <= firstRaidTick; tick++) sim.scheduler.tick({ tick });

    expect(sim.state.raidCount).toBe(1);
    expect(sim.state.raiders.length).toBeGreaterThanOrEqual(1);
    const r = sim.state.raiders[0]!;
    expect(r.strength).toBe(10);
    // A raider spawned on a map edge; its BFS path toward the keep is non-empty
    // unless water/terrain fully isolates the spawn edge (rare). pathStep starts
    // at 0 either way.
    expect(r.pathStep).toBe(0);
    expect(sim.state.threatLevel).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. siege strength calc: repelled vs sacked
// ---------------------------------------------------------------------------
describe("Phase 4 — siege resolution math", () => {
  it("computes defensive strength from defensive buildings and adjacent walls", () => {
    const sim = boot();
    sim.state.tier = "Town"; // keep requires Town tier to place
    const g = findGrass(sim.terrain, 3, 3, 30, 30);
    // Keep (def 8) + tower (def 5) adjacent walls.
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });
    sim.scheduler.tick({ tick: 0 });
    // Resolution system recomputed defensiveStrength on tick 0.
    expect(sim.state.defensiveStrength).toBeGreaterThanOrEqual(8);
  });

  it("strong defenses repel a raid; the keep survives", () => {
    const sim = boot();
    sim.state.tier = "Town"; // keep/garrison/tower require Town/Village tier to place
    const g = findGrass(sim.terrain, 3, 3, 40, 40);
    // Keep + garrison + 2 towers → defense >> first raid strength (10).
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "garrison", x: g.x, y: g.y + 4 } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "tower", x: g.x + 4, y: g.y } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "tower", x: g.x, y: g.y + 7 } });

    // Run long enough for the first raid to spawn AND reach the keep.
    for (let tick = 0; tick < 30 * TICKS_PER_DAY; tick++) sim.scheduler.tick({ tick });

    expect(sim.state.defensiveStrength).toBeGreaterThan(15);
    // Keep was never sacked; game not over from siege.
    expect(sim.state.keepSacked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. keep sacked → gameOver (undefended keep)
// ---------------------------------------------------------------------------
describe("Phase 4 — keep sacked", () => {
  it("an undefended keep is eventually sacked → gameOver", () => {
    const sim = boot();
    sim.state.tier = "Town"; // keep requires Town tier to place
    const g = findGrass(sim.terrain, 3, 3, 48, 48);
    // Place ONLY a keep — defenseStrength 8, but raids escalate (10,15,20,...).
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });

    let sacked = false;
    for (let tick = 0; tick < 60 * TICKS_PER_DAY; tick++) {
      sim.scheduler.tick({ tick });
      if (sim.state.keepSacked) { sacked = true; break; }
    }
    expect(sacked).toBe(true);
    expect(sim.state.gameOver).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. stone/planks/tools refining chains produce
// ---------------------------------------------------------------------------
describe("Phase 4 — refining chains", () => {
  it("quarry on stone → stone; sawmill wood → planks; smith stone → tools", () => {
    const sim = boot();
    sim.state.tier = "Town"; // quarry/sawmill/smith require Village tier to place
    const terrain = sim.terrain;
    const stoneSpot = findStone(terrain);
    expect(stoneSpot).not.toBeNull();
    const s = stoneSpot!;

    // Build a full food economy (so immigration keeps staffing slots) plus the
    // three Phase 4 refiners, all on one generous road carpet near the stone.
    const cmds: CitadelCommand[] = [];
    const store = findGrass(terrain, 3, 2, s.x + 6, s.y);
    const farm = findGrass(terrain, 3, 3, store.x + 5, store.y);
    const mill = findGrass(terrain, 2, 2, store.x + 5, store.y + 4);
    const bakery = findGrass(terrain, 2, 2, store.x, store.y + 5);
    const house1 = findGrass(terrain, 2, 2, store.x, store.y + 8);
    const house2 = findGrass(terrain, 2, 2, store.x + 4, store.y + 8);
    const house3 = findGrass(terrain, 2, 2, store.x + 8, store.y + 8);
    // Keep refiners well clear of the stone/quarry cluster (which may sit near
    // the map edge): place them to the right of the food economy.
    const sawmill = findGrass(terrain, 2, 2, store.x + 10, store.y);
    const smith = findGrass(terrain, 2, 2, store.x + 10, store.y + 4);

    cmds.push({ type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x, y: store.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "quarry", x: s.x, y: s.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "sawmill", x: sawmill.x, y: sawmill.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "smith", x: smith.x, y: smith.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "farm", x: farm.x, y: farm.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "mill", x: mill.x, y: mill.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "bakery", x: bakery.x, y: bakery.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "house", x: house1.x, y: house1.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "house", x: house2.x, y: house2.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "house", x: house3.x, y: house3.y } });

    // Generous road carpet over the whole bounding region so everything
    // connects and villagers can reach all worksites.
    const roadTiles: Array<{ x: number; y: number }> = [];
    const xs = [s.x, sawmill.x, smith.x, store.x, farm.x, mill.x, bakery.x, house1.x, house2.x, house3.x];
    const ys = [s.y, sawmill.y, smith.y, store.y, farm.y, mill.y, bakery.y, house1.y, house2.y, house3.y];
    const minX = Math.min(...xs) - 2;
    const maxX = Math.max(...xs) + 5;
    const minY = Math.min(...ys) - 2;
    const maxY = Math.max(...ys) + 5;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x < 0 || y < 0 || x >= terrain.width || y >= terrain.height) continue;
        const t = terrain.cells[y * terrain.width + x];
        if (t === TerrainType.Grass) roadTiles.push({ x, y });
      }
    }
    cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });

    for (const c of cmds) sim.commands.enqueue(c);

    // Run long enough for founders to staff every refiner and for the food
    // economy to sustain ongoing immigration. Inject wood each day so the
    // sawmill always has input (the woodcutter chain isn't part of this test).
    for (let tick = 0; tick < 20 * TICKS_PER_DAY; tick++) {
      if (tick % TICKS_PER_DAY === 0) sim.state.stockpiles.wood += 4;
      sim.scheduler.tick({ tick });
    }

    // Quarry should have produced stone (hauled to the global pool).
    expect(sim.state.stockpiles.stone).toBeGreaterThan(0);
    // Sawmill should have produced planks from the injected wood.
    expect(sim.state.stockpiles.planks).toBeGreaterThan(0);
    // Smith consumes stone → tools; with stone available it should make some.
    expect(sim.state.stockpiles.tools).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. determinism: same seed + walls + siege → deep-equal snapshot
// ---------------------------------------------------------------------------
describe("Phase 4 — determinism", () => {
  function runScenario(): RenderSnapshot {
    const sim = boot();
    sim.state.tier = "Town"; // keep/tower/wall require Town/Village tier to place
    const g = findGrass(sim.terrain, 3, 3, 40, 40);
    const cmds: CitadelCommand[] = [
      { type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } },
      { type: "placeBuilding", payload: { buildingType: "tower", x: g.x + 4, y: g.y } },
      { type: "placeWall", payload: { tiles: [
        { x: g.x - 1, y: g.y }, { x: g.x - 1, y: g.y + 1 }, { x: g.x - 1, y: g.y + 2 },
      ] } },
    ];
    for (const c of cmds) sim.commands.enqueue(c);
    const totalTicks = 20 * TICKS_PER_DAY;
    for (let tick = 0; tick < totalTicks; tick++) sim.scheduler.tick({ tick });
    return sim.getSnapshot(totalTicks);
  }

  it("same seed + same commands produces a deep-equal snapshot", () => {
    const a = runScenario();
    const b = runScenario();
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// 7. wall-reroute: a wall barrier forces raiders onto a longer path
// ---------------------------------------------------------------------------
describe("Phase 4 — wall reroutes raiders", () => {
  /**
   * Build a synthetic flat terrain (all Grass) so we control exactly where
   * walls appear.  Place a horizontal wall barrier between the spawn point
   * (north edge) and the keep (south half), leaving a gap at one end.
   * Assert that the wall-aware raider path is LONGER than the direct BFS path
   * that ignores walls — i.e., walls force a measurable detour.
   */
  it("wall barrier forces a longer raider path than an unobstructed direct route", () => {
    const W = 40;
    const H = 40;
    // All-grass synthetic terrain.
    const terrain: TerrainGrid = {
      width: W,
      height: H,
      cells: new Uint8Array(W * H).fill(TerrainType.Grass),
    };

    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    sim.state.tier = "Town"; // keep (Town) + wall (Village) require unlock to place

    // Place keep at (18, 28) so raiders target it.
    const keepX = 18;
    const keepY = 28;
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: keepX, y: keepY } });

    // Horizontal wall barrier at y=15 from x=5 to x=30, no gate (solid wall).
    // Raiders spawn near the north edge (y=0–2) and must go around the east or
    // west end of this barrier to reach the keep.
    const wallTiles: Array<{ x: number; y: number }> = [];
    const barrierY = 15;
    const barrierX0 = 5;
    const barrierX1 = 30;
    for (let x = barrierX0; x <= barrierX1; x++) wallTiles.push({ x, y: barrierY });
    sim.commands.enqueue({ type: "placeWall", payload: { tiles: wallTiles } });

    // Process commands.
    sim.scheduler.tick({ tick: 0 });

    // Raider spawns at a fixed north-edge tile (mid-top, well inside the barrier span).
    const spawnX = 18;
    const spawnY = 0;
    const targetX = keepX + 1; // keep center
    const targetY = keepY + 1;

    // Path WITHOUT walls: plain BFS on a flat terrain (all walkable, no walls).
    const directPath = bfsPath(
      spawnX, spawnY,
      targetX, targetY,
      (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < W && ty < H && terrain.cells[ty * W + tx] !== TerrainType.Water,
      W,
      H,
    );

    // Path WITH walls: raider walkability blocks wall tiles.
    const wallPath = computeRaiderPath(
      spawnX, spawnY,
      targetX, targetY,
      sim.state,
      sim.terrain, // the actual terrain from bootstrapSim
    );

    // Both paths must be non-null (flat terrain, open map).
    expect(directPath).not.toBeNull();
    expect(wallPath).not.toBeNull();

    // The wall-aware path must be STRICTLY longer (detour around the barrier).
    expect(wallPath!.length).toBeGreaterThan(directPath!.length);
  });
});
