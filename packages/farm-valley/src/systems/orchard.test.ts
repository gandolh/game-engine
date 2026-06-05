/**
 * brief 42 — orchard system tests
 *
 * Tests:
 *  1. Orchard tree matures after ORCHARD_MATURATION_DAYS days.
 *  2. Mature tree drops fruit in its yield season.
 *  3. Fruit-drop is perennial (happens again next cycle without replanting).
 *  4. Leaderboard counts mature orchards.
 *  5. bankFruit / totalFruitCount helpers.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim, leaderboard } from "../sim-bootstrap";
import {
  ORCHARD_MATURATION_DAYS,
  FRUIT_YIELD_PER_HARVEST,
  bankFruit,
  totalFruitCount,
} from "../economy";
import type { Inventory } from "../components";

const TICKS_PER_DAY = 10;

/** Run the sim for N days starting from startTick. Returns the next start tick. */
function runDays(sim: ReturnType<typeof bootstrapSim>, days: number, startTick = 0): number {
  const end = startTick + days * TICKS_PER_DAY;
  for (let t = startTick; t < end; t++) {
    sim.scheduler.tick({ tick: t });
  }
  return end;
}

describe("OrchardSystem", () => {
  it("tree matures after ORCHARD_MATURATION_DAYS days", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 50 });
    const { world } = sim;

    const farmerList = [...world.query("farmer", "inventory")];
    const farmer = farmerList[0]!;
    if (farmer.id === undefined) throw new Error("farmer has no id");

    const treeEntity = world.spawn({
      orchardTree: {
        kind: "apple",
        tileX: 5, tileY: 5,
        regionId: "farm-cora",
        ownerId: farmer.id,
        daysGrown: 0,
        mature: false,
        lastHarvestDay: -1,
        fruitReady: 0,
      },
    });

    // Run exactly ORCHARD_MATURATION_DAYS days.
    runDays(sim, ORCHARD_MATURATION_DAYS);

    expect(treeEntity.orchardTree!.mature).toBe(true);
    expect(treeEntity.orchardTree!.daysGrown).toBeGreaterThanOrEqual(ORCHARD_MATURATION_DAYS);
  });

  it("mature apple tree drops fruit in autumn", () => {
    // Apple seasons in autumn (days 50–74 in a 100-day run with 25-day seasons).
    // Spawn an already-mature apple tree and run to day 50 (first day of autumn).
    const sim = bootstrapSim({ seed: 3, ticksPerDay: TICKS_PER_DAY, maxDays: 100 });
    const { world } = sim;

    const farmerList = [...world.query("farmer", "inventory")];
    const farmer = farmerList[0]!;
    if (farmer.id === undefined) throw new Error("farmer has no id");

    const treeEntity = world.spawn({
      orchardTree: {
        kind: "apple",
        tileX: 5, tileY: 5,
        regionId: "farm-cora",
        ownerId: farmer.id,
        daysGrown: ORCHARD_MATURATION_DAYS,
        mature: true,
        lastHarvestDay: -1,
        fruitReady: 0,
      },
    });

    // seasonForDay uses 1-based days: d = day - 1, so autumn starts at day 51
    // (d=50, Math.floor(50/25)=2 = autumn). Run to day 52 to be safely in autumn.
    runDays(sim, 53);

    expect(treeEntity.orchardTree!.fruitReady).toBeGreaterThanOrEqual(FRUIT_YIELD_PER_HARVEST);
    expect(treeEntity.orchardTree!.lastHarvestDay).toBeGreaterThanOrEqual(51);
  });

  it("orchard is perennial — cherry fruits in spring each year", () => {
    // Cherry fruits in spring (days 0–24). Spawn a mature cherry tree and
    // verify it fruits in the first spring and again the "next" spring (since
    // the 100-day sim only has one spring, simulate perennial by checking
    // lastHarvestDay was reset correctly — once fruited, fruitReady > 0).
    const sim = bootstrapSim({ seed: 7, ticksPerDay: TICKS_PER_DAY, maxDays: 110 });
    const { world } = sim;

    const farmerList = [...world.query("farmer", "inventory")];
    const farmer = farmerList[0]!;
    if (farmer.id === undefined) throw new Error("farmer has no id");

    const treeEntity = world.spawn({
      orchardTree: {
        kind: "cherry",
        tileX: 5, tileY: 5,
        regionId: "farm-cora",
        ownerId: farmer.id,
        daysGrown: ORCHARD_MATURATION_DAYS,
        mature: true,
        lastHarvestDay: -1,
        fruitReady: 0,
      },
    });

    // Day 0 is spring; cherry should fruit on day 0 (first tick fires DAY_START day 0).
    let nextTick = runDays(sim, 1, 0);

    const firstFruit = treeEntity.orchardTree!.fruitReady;
    expect(firstFruit).toBeGreaterThanOrEqual(FRUIT_YIELD_PER_HARVEST);

    // Simulate the farmer harvesting (reset fruitReady to 0).
    // Keep lastHarvestDay set so the system doesn't re-fruit same season.
    treeEntity.orchardTree!.fruitReady = 0;

    // seasonForDay uses 1-based days: spring = days 1–25 (d=0–24), summer = 26–50 (d=25–49),
    // autumn = 51–75 (d=50–74), winter = 76–100 (d=75–99), next spring = 101–125 (d=100–124).
    // Run 102 more days to reach day 102 which is in the second spring (d=101 → Math.floor(101/25)=4 % 4=0).
    nextTick = runDays(sim, 102, nextTick);

    // The tree should have fruited again in the second spring.
    const secondFruit = treeEntity.orchardTree!.fruitReady;
    expect(secondFruit).toBeGreaterThanOrEqual(FRUIT_YIELD_PER_HARVEST);
  });

  it("leaderboard counts mature orchards in assetValue", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5 });
    const { world } = sim;

    const farmerList = [...world.query("farmer", "inventory")];
    const farmer = farmerList[0]!;
    if (farmer.id === undefined) throw new Error("farmer has no id");

    // Spawn a mature apple tree.
    world.spawn({
      orchardTree: {
        kind: "apple",
        tileX: 5, tileY: 5,
        regionId: "farm-cora",
        ownerId: farmer.id,
        daysGrown: ORCHARD_MATURATION_DAYS,
        mature: true,
        lastHarvestDay: -1,
        fruitReady: 0,
      },
    });

    runDays(sim, 1);

    const board = leaderboard(world);
    const entry = board.find(e => e.id === farmer.id);
    expect(entry).toBeDefined();
    // A mature orchard tree should contribute to assetValue.
    expect(entry!.assetValue).toBeGreaterThan(0);
    expect(entry!.totalValue).toBeGreaterThan(entry!.gold);
  });

  it("bankFruit and totalFruitCount helpers work correctly", () => {
    const inv: Inventory = {
      gold: 0,
      crops: { radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0 },
      seeds: { radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0 },
    };
    bankFruit(inv, "apple", 4, "normal");
    bankFruit(inv, "apple", 2, "silver");
    expect(totalFruitCount(inv, "apple")).toBe(6);
    expect(inv.fruit!["apple"]!.silver).toBe(2);
    expect(inv.fruit!["apple"]!.normal).toBe(4);
  });
});
