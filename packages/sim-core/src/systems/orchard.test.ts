import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapSim, leaderboard, type FarmerSummary } from "../sim-bootstrap";
import {
  ORCHARD_MATURATION_DAYS,
  FRUIT_YIELD_PER_HARVEST,
  bankFruit,
  totalFruitCount,
} from "../economy";
import type { Inventory, GameEntity } from "../components";

const TICKS_PER_DAY = 10;

describe("OrchardSystem", () => {
  let farmerId: number;
  let matureAtMaturationDay = false;
  let daysGrownAtMaturationDay = 0;
  let appleFruitByDay53 = 0;
  let appleLastHarvestByDay53 = -1;
  let cherryFirstFruit = 0;
  let cherrySecondFruit = 0;
  let boardAfterDay1: FarmerSummary[] = [];

  beforeAll(() => {
    const sim = bootstrapSim({ seed: 7, ticksPerDay: TICKS_PER_DAY, maxDays: 110 });
    const { world } = sim;

    const farmer = [...world.query("farmer", "inventory")][0]!;
    if (farmer.id === undefined) throw new Error("farmer has no id");
    farmerId = farmer.id;

    const tree = (kind: "apple" | "cherry", tileX: number, mature: boolean): GameEntity =>
      world.spawn({
        orchardTree: {
          kind,
          tileX, tileY: 5,
          regionId: "farm-cora",
          ownerId: farmerId,
          daysGrown: mature ? ORCHARD_MATURATION_DAYS : 0,
          mature,
          lastHarvestDay: -1,
          fruitReady: 0,
        },
      });

    const growing = tree("apple", 5, false);
    const matureApple = tree("apple", 6, true);
    const matureCherry = tree("cherry", 7, true);

    const runDays = (days: number, startTick: number): number => {
      const end = startTick + days * TICKS_PER_DAY;
      for (let t = startTick; t < end; t++) sim.scheduler.tick({ tick: t });
      return end;
    };

    let tick = runDays(1, 0);
    cherryFirstFruit = matureCherry.orchardTree!.fruitReady;
    boardAfterDay1 = leaderboard(world);
    matureCherry.orchardTree!.fruitReady = 0; 

    tick = runDays(ORCHARD_MATURATION_DAYS - 1, tick);
    matureAtMaturationDay = growing.orchardTree!.mature;
    daysGrownAtMaturationDay = growing.orchardTree!.daysGrown;

    tick = runDays(53 - ORCHARD_MATURATION_DAYS, tick);
    appleFruitByDay53 = matureApple.orchardTree!.fruitReady;
    appleLastHarvestByDay53 = matureApple.orchardTree!.lastHarvestDay;

    runDays(50, tick);
    cherrySecondFruit = matureCherry.orchardTree!.fruitReady;
  });

  it("tree matures after ORCHARD_MATURATION_DAYS days", () => {
    expect(matureAtMaturationDay).toBe(true);
    expect(daysGrownAtMaturationDay).toBeGreaterThanOrEqual(ORCHARD_MATURATION_DAYS);
  });

  it("mature apple tree drops fruit in autumn", () => {
    expect(appleFruitByDay53).toBeGreaterThanOrEqual(FRUIT_YIELD_PER_HARVEST);
    expect(appleLastHarvestByDay53).toBeGreaterThanOrEqual(51);
  });

  it("orchard is perennial — cherry fruits in spring each year", () => {
    expect(cherryFirstFruit).toBeGreaterThanOrEqual(FRUIT_YIELD_PER_HARVEST);
    expect(cherrySecondFruit).toBeGreaterThanOrEqual(FRUIT_YIELD_PER_HARVEST);
  });

  it("leaderboard counts mature orchards in assetValue", () => {
    const entry = boardAfterDay1.find(e => e.id === farmerId);
    expect(entry).toBeDefined();
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
