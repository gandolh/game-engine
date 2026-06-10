/// <reference types="node" />
import { ZERO_CROPS } from "../economy";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MessageBus,
  World,
  createPathfinderFromBytes,
  type Pathfinder,
  type PathfinderGrid,
} from "@engine/core";
import type { GameEntity, FarmerFsmState } from "../components";
import { TravelSystem, STEP_TICKS, smoothPath } from "./travel";
import { buildWalkableGrid } from "../world/walkable-grid";
import { getRegion, WORLD_WIDTH, WORLD_HEIGHT, type RegionId } from "../world/regions";
import { ONT_TRAVEL, type TravelArrivedBody } from "../protocols/travel";

const __dirname = dirname(fileURLToPath(import.meta.url));
// The pathfinder WASM artifact is built by @engine/wasm-modules; reference its
// committed dist output (sim-core ships no public/ assets of its own).
const wasmPath = resolve(
  __dirname,
  "../../../wasm-modules/dist/pathfinding.wasm",
);

function loadBytes(): ArrayBuffer {
  const buf = readFileSync(wasmPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function makeFarmer(
  world: World<GameEntity>,
  opts: { x: number; y: number; region: RegionId },
): GameEntity {
  return world.spawn({
    transform: { x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y, rotation: 0 },
    fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
    intentions: { queue: [] },
    personality: { kind: "conservative" },
    inbox: { messages: [] },
    farmer: { name: "T", currentRegion: opts.region },
    inventory: {
      gold: 0,
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS },
    },
  });
}

function captureArrived(bus: MessageBus): TravelArrivedBody[] {
  const out: TravelArrivedBody[] = [];
  bus.subscribeOntology(ONT_TRAVEL.ARRIVED, (msg) => {
    out.push(msg.body as unknown as TravelArrivedBody);
  });
  return out;
}

describe("smoothPath", () => {
  // All-walkable 10x10 field unless a tile is listed as blocked.
  const field = (blocked: ReadonlyArray<[number, number]>) => {
    const set = new Set(blocked.map(([x, y]) => `${x},${y}`));
    return (x: number, y: number) =>
      x >= 0 && y >= 0 && x < 10 && y < 10 && !set.has(`${x},${y}`);
  };

  it("returns a copy unchanged for paths of length <= 2", () => {
    const p = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
    const out = smoothPath(p, field([]));
    expect(out).toEqual(p);
    expect(out).not.toBe(p); // fresh array, not the input
  });

  it("cuts an L-shaped staircase into a diagonal on open ground", () => {
    // 4-connected staircase from (0,0) to (3,3): E,S,E,S,E,S...
    const stair = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 },
      { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 },
    ];
    const out = smoothPath(stair, field([]));
    // On open ground the smoothed route is the straight diagonal — every step
    // advances both axes by one.
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 3, y: 3 });
    for (let i = 1; i < out.length; i += 1) {
      const dx = Math.abs(out[i]!.x - out[i - 1]!.x);
      const dy = Math.abs(out[i]!.y - out[i - 1]!.y);
      expect(dx).toBe(1);
      expect(dy).toBe(1);
    }
  });

  it("keeps every smoothed step adjacent (one tile, 4- or 8-connected)", () => {
    const stair = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 },
      { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 },
    ];
    const out = smoothPath(stair, field([]));
    for (let i = 1; i < out.length; i += 1) {
      const dx = Math.abs(out[i]!.x - out[i - 1]!.x);
      const dy = Math.abs(out[i]!.y - out[i - 1]!.y);
      expect(Math.max(dx, dy)).toBe(1); // adjacent
    }
  });

  it("never produces a step onto a blocked tile", () => {
    // Wall down the middle column x=2 (rows 0..8 blocked), forcing a detour.
    const blocked: [number, number][] = [];
    for (let y = 0; y <= 8; y += 1) blocked.push([2, y]);
    const isWalkable = field(blocked);
    // A hand-built 4-connected path around the wall (down to y=9, across, up).
    const around = [
      { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 },
      { x: 0, y: 4 }, { x: 0, y: 5 }, { x: 0, y: 6 }, { x: 0, y: 7 },
      { x: 0, y: 8 }, { x: 0, y: 9 }, { x: 1, y: 9 }, { x: 2, y: 9 },
      { x: 3, y: 9 }, { x: 3, y: 8 }, { x: 3, y: 7 },
    ];
    const out = smoothPath(around, isWalkable);
    for (const step of out) {
      expect(isWalkable(step.x, step.y)).toBe(true);
    }
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 3, y: 7 });
  });

  it("is deterministic — identical input yields byte-identical output", () => {
    const stair = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 },
      { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 },
    ];
    const a = smoothPath(stair, field([]));
    const b = smoothPath(stair, field([]));
    expect(a).toEqual(b);
  });
});

describe("TravelSystem", () => {
  let pathfinder: Pathfinder;
  let grid: PathfinderGrid;

  beforeAll(async () => {
    pathfinder = await createPathfinderFromBytes(loadBytes());
    grid = buildWalkableGrid();
  });

  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: TravelSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    sys = new TravelSystem(world, pathfinder, grid, bus);
  });

  it("moves a farmer from Cora's farm to the village and emits ARRIVED", () => {
    const cora = getRegion("farm-cora");
    const village = getRegion("village");
    const farmer = makeFarmer(world, {
      x: cora.center.x,
      y: cora.center.y,
      region: "farm-cora",
    });
    farmer.intentions!.queue.push({
      kind: "travel",
      data: { targetRegionId: "village" },
      priority: 0,
    });

    const arrivals = captureArrived(bus);

    // Run enough ticks to traverse the whole path. Worst-case bound: every tile
    // in the grid + STEP_TICKS slack. The system finishes in far fewer.
    const maxTicks = WORLD_WIDTH * WORLD_HEIGHT * STEP_TICKS;
    let tick = 0;
    let resolved = false;
    while (tick < maxTicks) {
      sys.run({ tick });
      bus.flush();
      bus.notifySubscribers();
      tick++;
      if (farmer.farmer!.currentRegion === "village" && !farmer.farmer!.path) {
        resolved = true;
        break;
      }
    }

    expect(resolved).toBe(true);
    expect(farmer.farmer!.currentRegion).toBe("village");
    expect(farmer.farmer!.path).toBeUndefined();
    expect(farmer.intentions!.queue.length).toBe(0);
    expect(farmer.transform!.x).toBe(village.center.x);
    expect(farmer.transform!.y).toBe(village.center.y);
    expect(arrivals.length).toBe(1);
    expect(arrivals[0]).toEqual({ farmerId: farmer.id, regionId: "village" });
  });

  it("routes around the void: every waypoint of a real farm→village path is walkable and uses the road corridor", () => {
    // The real walkable grid blocks the vast majority of the 40×40 world —
    // only region bounds + road corridors are walkable. A farm connects to the
    // village ONLY through a narrow road, so a correct path must funnel through
    // it and must never cross a blocked (void) tile. This proves the WASM
    // pathfinder is load-bearing on the real game grid, not just a synthetic
    // one (engine-level around-obstacle routing is covered in
    // packages/engine/src/wasm/pathfinder.test.ts "routes around a wall").
    const cora = getRegion("farm-cora");
    const village = getRegion("village");
    const path = pathfinder.findPath(grid, cora.center, village.center);

    // Non-trivial multi-tile route.
    expect(path.length).toBeGreaterThan(2);

    // Endpoints are the farm and village centers.
    expect(path[0]).toEqual({ x: cora.center.x, y: cora.center.y });
    expect(path[path.length - 1]).toEqual({ x: village.center.x, y: village.center.y });

    // Every waypoint is walkable (0) in the real grid — never a void tile.
    for (const p of path) {
      expect(grid.cells[p.y * grid.width + p.x]).toBe(0);
    }

    // Steps are 4-connected (one tile at a time, no diagonal teleports).
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i]!.x - path[i - 1]!.x);
      const dy = Math.abs(path[i]!.y - path[i - 1]!.y);
      expect(dx + dy).toBe(1);
    }

    // The route leaves the farm bounds and crosses tiles that belong to neither
    // the farm nor the village — i.e. it actually travels the road corridor
    // rather than the two regions being adjacent.
    const inFarm = (p: { x: number; y: number }) =>
      p.x >= cora.bounds.minX && p.x <= cora.bounds.maxX &&
      p.y >= cora.bounds.minY && p.y <= cora.bounds.maxY;
    const inVillage = (p: { x: number; y: number }) =>
      p.x >= village.bounds.minX && p.x <= village.bounds.maxX &&
      p.y >= village.bounds.minY && p.y <= village.bounds.maxY;
    const corridorTiles = path.filter((p) => !inFarm(p) && !inVillage(p));
    expect(corridorTiles.length).toBeGreaterThan(0);
  });

  it("drops a travel intent and warns when no path exists", () => {
    const farmer = makeFarmer(world, { x: 19, y: 5, region: "farm-cora" });
    farmer.intentions!.queue.push({
      kind: "travel",
      data: { targetRegionId: "village" },
      priority: 0,
    });

    // Use a fully-blocked grid → any findPath returns []. This avoids touching
    // the shared `grid` instance the other tests rely on.
    const blocked: PathfinderGrid = {
      cells: new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT).fill(1),
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
    };
    const isolatedSys = new TravelSystem(world, pathfinder, blocked, bus);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    isolatedSys.run({ tick: 0 });

    expect(farmer.intentions!.queue.length).toBe(0);
    expect(farmer.farmer!.path).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("resolves same-region travel instantly without crashing", () => {
    const village = getRegion("village");
    const farmer = makeFarmer(world, {
      x: village.center.x,
      y: village.center.y,
      region: "village",
    });
    farmer.intentions!.queue.push({
      kind: "travel",
      data: { targetRegionId: "village" },
      priority: 0,
    });

    const arrivals = captureArrived(bus);

    sys.run({ tick: 0 });
    bus.flush();
    bus.notifySubscribers();

    expect(farmer.farmer!.currentRegion).toBe("village");
    expect(farmer.farmer!.path).toBeUndefined();
    expect(farmer.intentions!.queue.length).toBe(0);
    expect(arrivals.length).toBe(1);
    expect(arrivals[0]).toEqual({ farmerId: farmer.id, regionId: "village" });
  });
});
