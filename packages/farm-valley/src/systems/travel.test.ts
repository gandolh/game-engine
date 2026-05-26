/// <reference types="node" />
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
import { TravelSystem, STEP_TICKS } from "./travel";
import { buildWalkableGrid } from "../world/walkable-grid";
import { getRegion, WORLD_WIDTH, WORLD_HEIGHT, type RegionId } from "../world/regions";
import { ONT_TRAVEL, type TravelArrivedBody } from "../protocols/travel";

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(__dirname, "../../public/wasm/pathfinding.wasm");

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
      crops: { radish: 0, wheat: 0, pumpkin: 0 },
      seeds: { radish: 0, wheat: 0, pumpkin: 0 },
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
