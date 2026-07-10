import { describe, it, expect } from "vitest";
import type { GameEntity, CropKind } from "../../../components";
import { ZERO_CROPS, CROP_SELL_PRICE } from "../../../economy";
import { handleSellShopkeeper, handleProcessCrop } from "./commerce";
import { MILL_PRICE, MILL_BATCH } from "../constants";
import type { ActingFarmer } from "../types";

function makeFarmer(over: Partial<GameEntity> = {}): ActingFarmer {
  return {
    id: 1,
    fsm: { current: "ACT" },
    intentions: { queue: [] },
    inventory: {
      gold: 0,
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS },
    },
    farmer: { name: "Tester", currentRegion: "farm-atticus" },
    ...over,
  } as ActingFarmer;
}

describe("handleSellShopkeeper", () => {
  const crop: CropKind = "radish";

  it("no-ops when the farmer is away from the village (home farm, no travel yet)", () => {
    const farmer = makeFarmer();
    farmer.inventory.crops[crop] = 5;

    handleSellShopkeeper(farmer, { kind: "sell-shopkeeper", data: { crop, quantity: 5 }, priority: 0 });

    expect(farmer.inventory.crops[crop]).toBe(5);
    expect(farmer.inventory.gold).toBe(0);
  });

  it("sells at the shopkeeper once the farmer has actually reached the village", () => {
    const farmer = makeFarmer({ farmer: { name: "Tester", currentRegion: "village" } });
    farmer.inventory.crops[crop] = 5;

    handleSellShopkeeper(farmer, { kind: "sell-shopkeeper", data: { crop, quantity: 5 }, priority: 0 });

    expect(farmer.inventory.crops[crop]).toBe(0);
    expect(farmer.inventory.gold).toBe(CROP_SELL_PRICE[crop] * 5);
  });

  it("debits cropQuality tiers gold-first, matching the price it paid (regression for the debitCrop refactor)", () => {
    const farmer = makeFarmer({ farmer: { name: "Tester", currentRegion: "village" } });
    farmer.inventory.crops[crop] = 5;
    farmer.inventory.cropQuality = { [crop]: { normal: 2, silver: 1, gold: 2 } };

    handleSellShopkeeper(farmer, { kind: "sell-shopkeeper", data: { crop, quantity: 5 }, priority: 0 });

    expect(farmer.inventory.crops[crop]).toBe(0);
    const q = farmer.inventory.cropQuality![crop]!;
    expect(q).toEqual({ normal: 0, silver: 0, gold: 0 });
    // 2 gold + 1 silver + 2 normal, priced at their own multiplier each.
    const expectedGold = Math.round(CROP_SELL_PRICE[crop] * 1.5 * 2)
      + Math.round(CROP_SELL_PRICE[crop] * 1.25 * 1)
      + Math.round(CROP_SELL_PRICE[crop] * 1.0 * 2);
    expect(farmer.inventory.gold).toBe(expectedGold);
  });
});

describe("handleProcessCrop (mill)", () => {
  const crop: CropKind = "radish";

  it("debits cropQuality tiers in lockstep with crops (no phantom tier after milling)", () => {
    // Brief 99, review-findings item 28 ("mill processing" named culprit):
    // the mill used to do `farmer.inventory.crops[crop] -= taken` directly
    // and never touched cropQuality, leaving a phantom tier count once
    // crops[] shrank out from under it.
    const farmer = makeFarmer({ farmer: { name: "Tester", currentRegion: "mill" } });
    farmer.inventory.crops[crop] = 8;
    farmer.inventory.cropQuality = { [crop]: { normal: 0, silver: 0, gold: 8 } };

    handleProcessCrop(farmer, { kind: "process-crop", data: { crop }, priority: 0 });

    expect(farmer.inventory.crops[crop]).toBe(8 - MILL_BATCH);
    expect(farmer.inventory.gold).toBe(MILL_PRICE[crop] * MILL_BATCH);
    const q = farmer.inventory.cropQuality![crop]!;
    expect(q.normal + q.silver + q.gold).toBe(farmer.inventory.crops[crop]);
    expect(q).toEqual({ normal: 0, silver: 0, gold: 8 - MILL_BATCH });
  });

  it("no-ops when there is nothing to mill", () => {
    const farmer = makeFarmer({ farmer: { name: "Tester", currentRegion: "mill" } });
    handleProcessCrop(farmer, { kind: "process-crop", data: { crop }, priority: 0 });
    expect(farmer.inventory.gold).toBe(0);
  });
});
