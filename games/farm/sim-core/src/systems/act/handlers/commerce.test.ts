import { describe, it, expect } from "vitest";
import type { GameEntity, CropKind } from "../../../components";
import { ZERO_CROPS, CROP_SELL_PRICE } from "../../../economy";
import { handleSellShopkeeper } from "./commerce";
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
});
