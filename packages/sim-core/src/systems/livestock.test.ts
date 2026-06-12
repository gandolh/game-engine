import { describe, it, expect } from "vitest";
import { bootstrapSim, leaderboard } from "../sim-bootstrap";
import { bankProduct, totalProductCount } from "../economy";
import type { Inventory } from "../components";
import type { Intention } from "@engine/core";
import { ranchForFarm, getRegion } from "../world/regions";
import { handleTend } from "./act/handlers/build";
import { deliberateTendPens } from "../agents/watering/livestock";

const TICKS_PER_DAY = 10;

function runDays(sim: ReturnType<typeof bootstrapSim>, days: number, startTick = 0): number {
  const end = startTick + days * TICKS_PER_DAY;
  for (let t = startTick; t < end; t++) {
    sim.scheduler.tick({ tick: t });
  }
  return end;
}

describe("LivestockSystem", () => {
  it("fed+tended pen yields product the next day", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5 });
    const { world } = sim;

    const farmerList = [...world.query("farmer", "inventory")];
    const farmer = farmerList[0]!;
    if (farmer.id === undefined) throw new Error("farmer has no id");

    world.spawn({
      pen: {
        kind: "coop",
        animal: "chicken",
        count: 3,
        care: 0.8,
        fedToday: true,
        tileX: 5, tileY: 5,
        regionId: "farm-cora",
        ownerId: farmer.id,
      },
    });

    runDays(sim, 1);

    const eggs = totalProductCount(farmer.inventory, "egg");
    expect(eggs).toBeGreaterThanOrEqual(3);
  });

  it("unfed pen yields nothing and decays care faster than fed pen", () => {
    const sim = bootstrapSim({ seed: 2, ticksPerDay: TICKS_PER_DAY, maxDays: 5 });
    const { world } = sim;

    const farmerList = [...world.query("farmer", "inventory")];
    const farmer = farmerList[0]!;
    if (farmer.id === undefined) throw new Error("farmer has no id");

    const penEntity = world.spawn({
      pen: {
        kind: "barn",
        animal: "cow",
        count: 2,
        care: 0.8,
        fedToday: false,
        tileX: 6, tileY: 6,
        regionId: "farm-cora",
        ownerId: farmer.id,
      },
    });

    const careBefore = penEntity.pen!.care;
    runDays(sim, 1);

    const milk = totalProductCount(farmer.inventory, "milk");
    expect(milk).toBe(0);

    const careDecay = careBefore - penEntity.pen!.care; // unfed decay > fed decay (0.05)
    expect(careDecay).toBeGreaterThan(0.05);
  });

  it("product quality roll is deterministic — identical seed produces identical results", () => {
    function runAndGetEggCount(): number {
      const sim = bootstrapSim({ seed: 42, ticksPerDay: TICKS_PER_DAY, maxDays: 3 });
      const { world } = sim;
      const farmerList = [...world.query("farmer", "inventory")];
      const farmer = farmerList[0]!;
      if (farmer.id === undefined) return -1;
      world.spawn({
        pen: {
          kind: "coop", animal: "chicken", count: 1, care: 0.9,
          fedToday: true, tileX: 5, tileY: 5,
          regionId: "farm-cora", ownerId: farmer.id,
        },
      });
      runDays(sim, 2);
      return totalProductCount(farmer.inventory, "egg");
    }
    const run1 = runAndGetEggCount();
    const run2 = runAndGetEggCount();
    expect(run1).toBe(run2);
    expect(run1).toBeGreaterThan(0);
  });

  it("leaderboard includes pen asset value in totalValue", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5 });
    const { world } = sim;

    const farmerList = [...world.query("farmer", "inventory")];
    const farmer = farmerList[0]!;
    if (farmer.id === undefined) throw new Error("farmer has no id");

    world.spawn({
      pen: {
        kind: "coop", animal: "chicken", count: 2,
        care: 0.5, fedToday: false, tileX: 5, tileY: 5,
        regionId: "farm-cora", ownerId: farmer.id,
      },
    });

    runDays(sim, 1);

    const board = leaderboard(world);
    const entry = board.find(e => e.id === farmer.id);
    expect(entry).toBeDefined();
    expect(entry!.assetValue).toBeGreaterThanOrEqual(30); // 2 chickens × 15
    expect(entry!.totalValue).toBeGreaterThan(entry!.gold);
  });

  it("tend is gated on being at the pen's ranch (relocation: pens live on the ranch island)", () => {
    const sim = bootstrapSim({ seed: 7, ticksPerDay: TICKS_PER_DAY, maxDays: 5 });
    const { world } = sim;
    const farmer = [...world.query("farmer", "inventory")][0]!;
    if (farmer.id === undefined) throw new Error("farmer has no id");

    // Force a known home farm + its ranch; place an unfed coop on the ranch.
    farmer.farmer!.homeRegion = "farm-cora";
    const ranch = ranchForFarm("farm-cora");
    expect(ranch).toBeDefined();
    const ranchDef = getRegion(ranch!);
    const penEntity = world.spawn({
      pen: {
        kind: "coop", animal: "chicken", count: 1, care: 0.8,
        fedToday: false, tileX: ranchDef.center.x, tileY: ranchDef.center.y,
        regionId: ranch!, ownerId: farmer.id,
      },
    });
    const intent: Intention = { kind: "tend", data: { penKind: "coop" }, priority: 5 };

    // OFF the ranch (on the home farm): handleTend must no-op.
    farmer.farmer!.currentRegion = "farm-cora";
    handleTend(farmer as never, intent, world);
    expect(penEntity.pen!.fedToday).toBe(false);

    // deliberateTendPens queues a travel to the ranch (the bridge-crossing trip).
    farmer.intentions!.queue.length = 0;
    farmer.beliefs!.data["hasPen_coop"] = true;
    farmer.beliefs!.data["coopFedToday"] = false;
    deliberateTendPens(farmer, 5);
    const travel = farmer.intentions!.queue.find(
      i => i.kind === "travel" && i.data.targetRegionId === ranch,
    );
    expect(travel, "should queue a travel to the ranch when away").toBeDefined();

    // ON the ranch: handleTend feeds + boosts care.
    farmer.farmer!.currentRegion = ranch!;
    const careBefore = penEntity.pen!.care;
    handleTend(farmer as never, intent, world);
    expect(penEntity.pen!.fedToday).toBe(true);
    expect(penEntity.pen!.care).toBeGreaterThan(careBefore);
  });

  it("bankProduct helper adds quality-tracked products to inventory", () => {
    const inv: Inventory = {
      gold: 100,
      crops: { radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0 },
      seeds: { radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0 },
    };
    bankProduct(inv, "egg", 3, "normal");
    bankProduct(inv, "egg", 1, "gold");
    expect(totalProductCount(inv, "egg")).toBe(4);
    expect(inv.products!["egg"]!.gold).toBe(1);
    expect(inv.products!["egg"]!.normal).toBe(3);
  });
});
