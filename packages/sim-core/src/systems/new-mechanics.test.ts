import { ZERO_CROPS } from "../economy";
import { describe, it, expect } from "vitest";
import { World, createRng } from "@engine/core";
import type { GameEntity } from "../components";
import { ActSystem } from "./act";
import { MessageBus } from "@engine/core";
import {
  deliberateMillVisit,
  deliberateSeasonalForage,
  deliberateBuyTool,
  deliberateRefillCan,
} from "../agents/watering";
import { getRegion } from "../world/regions";

interface FarmerOverrides {
  region?: string;
  homeRegion?: string;
  gold?: number;
  crops?: Record<string, number>;
  day?: number;
  tools?: Array<{ kind: string; tier: string; durability: number }>;
  charges?: number;
}

// Minimal farmer fixture for action-level tests. ActSystem processes the
// intentions.queue when fsm.current === "ACT". Cast through `unknown` because
// this is a deliberately partial fixture, not a fully-typed game entity.
function makeFarmer(over: FarmerOverrides): GameEntity {
  const ZERO = { ...ZERO_CROPS };
  return {
    id: 1,
    transform: { x: 16, y: 29, prevX: 16, prevY: 29, rotation: 0 },
    farmer: {
      name: "T",
      currentRegion: over.region ?? "mill",
      homeRegion: over.homeRegion ?? "farm-cora",
    },
    fsm: { current: "ACT", enteredTick: 0 },
    beliefs: { data: { currentDay: over.day ?? 51 }, revision: 0 },
    desires: { data: { minGoldReserve: 0 } },
    intentions: { queue: [] },
    inventory: {
      gold: over.gold ?? 0,
      crops: { ...ZERO, ...over.crops },
      seeds: { ...ZERO },
      tools: over.tools ?? [],
      wateringCan: { charges: over.charges ?? 0, maxCharges: 10 },
    },
    ap: { current: 100, max: 100, penaltyPending: false, penaltyCapacity: 50, away: false },
  } as unknown as GameEntity;
}

function runAct(farmer: GameEntity, extraEntities?: Partial<GameEntity>[]): void {
  const world = new World<GameEntity>();
  // Re-register the prebuilt farmer entity into the world.
  world.spawn(farmer as Record<string, unknown>);
  for (const e of extraEntities ?? []) {
    world.spawn(e as Record<string, unknown>);
  }
  const bus = new MessageBus();
  const act = new ActSystem(world, createRng(1), bus);
  act.run({ tick: 100 });
}

describe("mill — process-crop", () => {
  it("converts crops to gold at the mill (premium)", () => {
    const f = makeFarmer({ region: "mill", crops: { wheat: 5 }, gold: 0 });
    f.intentions!.queue.push({ kind: "process-crop", data: { crop: "wheat" }, priority: 1 });
    runAct(f);
    // MILL_PRICE.wheat = 13 → 5 * 13 = 65 gold, crops drained.
    expect(f.inventory!.gold).toBe(65);
    expect(f.inventory!.crops.wheat).toBe(0);
  });

  it("does nothing when not at the mill", () => {
    const f = makeFarmer({ region: "farm-cora", crops: { wheat: 5 }, gold: 0 });
    f.intentions!.queue.push({ kind: "process-crop", data: { crop: "wheat" }, priority: 1 });
    runAct(f);
    expect(f.inventory!.gold).toBe(0);
    expect(f.inventory!.crops.wheat).toBe(5);
  });
});

describe("seasonal forage", () => {
  it("rewards gold when in the right zone + season (autumn, mushroom-grove)", () => {
    const f = makeFarmer({ region: "mushroom-grove", day: 51, gold: 0 }); // day 51 = autumn
    f.intentions!.queue.push({ kind: "forage", data: {}, priority: 1 });
    runAct(f);
    expect(f.inventory!.gold).toBe(18); // mushroom-grove reward
  });

  it("gives nothing out of season (spring at mushroom-grove)", () => {
    const f = makeFarmer({ region: "mushroom-grove", day: 1, gold: 0 }); // day 1 = spring
    f.intentions!.queue.push({ kind: "forage", data: {}, priority: 1 });
    runAct(f);
    expect(f.inventory!.gold).toBe(0);
  });

  it("ice-pond rewards in winter", () => {
    const f = makeFarmer({ region: "ice-pond", day: 80, gold: 0 }); // day 80 = winter
    f.intentions!.queue.push({ kind: "forage", data: {}, priority: 1 });
    runAct(f);
    expect(f.inventory!.gold).toBe(22);
  });
});

describe("buy-tool location guard", () => {
  it("buys only in the village", () => {
    const f = makeFarmer({ region: "village", gold: 100, tools: [] });
    f.intentions!.queue.push({ kind: "buy-tool", data: { toolKind: "hoe" }, priority: 1 });
    runAct(f);
    expect(f.inventory!.tools!.some((t) => t.kind === "hoe")).toBe(true);
    expect(f.inventory!.gold).toBe(95); // TOOL_PRICE.wooden = 5
  });

  it("does not buy outside the village", () => {
    const f = makeFarmer({ region: "farm-cora", gold: 100, tools: [] });
    f.intentions!.queue.push({ kind: "buy-tool", data: { toolKind: "hoe" }, priority: 1 });
    runAct(f);
    expect(f.inventory!.tools!.length).toBe(0);
    expect(f.inventory!.gold).toBe(100);
  });
});

describe("refill-can location guard", () => {
  // farm-cora fountain is at (3, 3) — minX+1=3, minY+1=3 (see region-setup.ts;
  // Cora is the NW-corner island at 2-13×2-13). Farmer must be within Chebyshev 1.
  it("refills when adjacent to the home fountain tile", () => {
    const f = makeFarmer({ region: "farm-cora", homeRegion: "farm-cora", charges: 0 });
    // Place farmer at (4, 3) — Chebyshev 1 from fountain at (3, 3).
    f.transform = { x: 4, y: 3, prevX: 4, prevY: 3, rotation: 0 };
    f.intentions!.queue.push({ kind: "refill-can", data: {}, priority: 0 });
    // Spawn a fountain entity at (3, 3) for farm-cora so ActSystem can find it.
    const fountainEntity: Partial<GameEntity> = {
      transform: { x: 3, y: 3, prevX: 3, prevY: 3, rotation: 0 },
      fountain: { isFountain: true, regionId: "farm-cora" },
    };
    runAct(f, [fountainEntity]);
    expect(f.inventory!.wateringCan!.charges).toBe(10);
  });

  // Farmer must be within Chebyshev 1 of a well center. Wells use REGIONS data
  // (no fountain entity needed). Derive the well center so the test survives
  // layout changes.
  it("refills at a well (adjacent to well center)", () => {
    const f = makeFarmer({ region: "well-north", homeRegion: "farm-cora", charges: 0 });
    const well = getRegion("well-north").center;
    // Place farmer ON the well-north center — Chebyshev 0.
    f.transform = { x: well.x, y: well.y, prevX: well.x, prevY: well.y, rotation: 0 };
    f.intentions!.queue.push({ kind: "refill-can", data: {}, priority: 0 });
    runAct(f);
    expect(f.inventory!.wateringCan!.charges).toBe(10);
  });

  it("does NOT refill when not adjacent to any water source", () => {
    const f = makeFarmer({ region: "forest-north", homeRegion: "farm-cora", charges: 0 });
    // Default transform (16, 29) is far from all water sources.
    f.intentions!.queue.push({ kind: "refill-can", data: {}, priority: 0 });
    runAct(f);
    expect(f.inventory!.wateringCan!.charges).toBe(0);
  });
});

describe("deliberation routing", () => {
  it("deliberateMillVisit queues travel-to-mill before process-crop", () => {
    const f = makeFarmer({ region: "farm-cora", crops: { wheat: 12 } });
    f.intentions!.queue.length = 0;
    deliberateMillVisit(f, 8, 6);
    const q = f.intentions!.queue;
    const travel = q.find((i) => i.kind === "travel" && i.data["targetRegionId"] === "mill");
    const proc = q.find((i) => i.kind === "process-crop");
    expect(travel).toBeTruthy();
    expect(proc).toBeTruthy();
    expect(travel!.priority).toBeLessThan(proc!.priority); // travel runs first
  });

  it("deliberateSeasonalForage routes to mushroom-grove in autumn", () => {
    const f = makeFarmer({ region: "farm-cora", day: 51 });
    f.intentions!.queue.length = 0;
    deliberateSeasonalForage(f, 7);
    const q = f.intentions!.queue;
    expect(q.some((i) => i.kind === "travel" && i.data["targetRegionId"] === "mushroom-grove")).toBe(true);
    expect(q.some((i) => i.kind === "forage")).toBe(true);
  });

  it("deliberateSeasonalForage is a no-op out of season", () => {
    const f = makeFarmer({ region: "farm-cora", day: 1 }); // spring
    f.intentions!.queue.length = 0;
    deliberateSeasonalForage(f, 7);
    expect(f.intentions!.queue.length).toBe(0);
  });

  it("deliberateBuyTool queues travel-to-village BEFORE buy-tool (priority order)", () => {
    const f = makeFarmer({ region: "farm-cora", gold: 100, tools: [] });
    f.intentions!.queue.length = 0;
    deliberateBuyTool(f, "hoe", 2);
    const q = f.intentions!.queue;
    const travel = q.find((i) => i.kind === "travel" && i.data["targetRegionId"] === "village");
    const buy = q.find((i) => i.kind === "buy-tool");
    expect(travel).toBeTruthy();
    expect(buy).toBeTruthy();
    expect(travel!.priority).toBeLessThan(buy!.priority); // travel sorts first (ascending)
  });

  // Strict proximity: when the farmer is not adjacent to any water source,
  // deliberateRefillCan queues ONLY a travel intent (not the refill action).
  // The refill fires in the NEXT deliberation cycle after the farmer arrives.
  it("deliberateRefillCan queues ONLY travel when away (no refill this cycle)", () => {
    const f = makeFarmer({ region: "forest-north", homeRegion: "farm-cora", charges: 0 });
    // Default transform (16, 29) is far from fountain (15, 1) and wells.
    f.intentions!.queue.length = 0;
    deliberateRefillCan(f, 3);
    const q = f.intentions!.queue;
    const travel = q.find((i) => i.kind === "travel");
    const refill = q.find((i) => i.kind === "refill-can");
    expect(travel).toBeTruthy(); // travel toward fountain is queued
    expect(refill).toBeUndefined(); // refill-can is deferred to next cycle
  });
});
