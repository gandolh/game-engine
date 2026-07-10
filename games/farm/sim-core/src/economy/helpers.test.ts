import { describe, it, expect } from "vitest";
import type { Inventory } from "../components";
import { ZERO_CROPS } from "./crops";
import { debitCrop, deductCrops, bankHarvest } from "./helpers";

function makeInventory(over: Partial<Inventory> = {}): Inventory {
  return {
    gold: 0,
    crops: { ...ZERO_CROPS },
    seeds: { ...ZERO_CROPS },
    ...over,
  };
}

describe("debitCrop", () => {
  it("decrements crops and cropQuality together (default order: silver, normal, gold)", () => {
    const inv = makeInventory({
      crops: { ...ZERO_CROPS, wheat: 6 },
      cropQuality: { wheat: { normal: 2, silver: 3, gold: 1 } },
    });

    const taken = debitCrop(inv, "wheat", 4);

    expect(taken).toBe(4);
    expect(inv.crops.wheat).toBe(2);
    // silver (3) drained first, then 1 from normal — matches crops[] exactly.
    const q = inv.cropQuality!.wheat!;
    expect(q).toEqual({ normal: 1, silver: 0, gold: 1 });
    expect(q.normal + q.silver + q.gold).toBe(inv.crops.wheat);
  });

  it("honors preferQuality by draining that tier first", () => {
    const inv = makeInventory({
      crops: { ...ZERO_CROPS, wheat: 5 },
      cropQuality: { wheat: { normal: 1, silver: 1, gold: 3 } },
    });

    debitCrop(inv, "wheat", 4, "gold");

    const q = inv.cropQuality!.wheat!;
    // gold (3) drained first, then 1 from silver.
    expect(q).toEqual({ normal: 1, silver: 0, gold: 0 });
    expect(q.normal + q.silver + q.gold).toBe(inv.crops.wheat);
  });

  it("caps the debit at what's actually on hand", () => {
    const inv = makeInventory({
      crops: { ...ZERO_CROPS, wheat: 2 },
      cropQuality: { wheat: { normal: 2, silver: 0, gold: 0 } },
    });

    const taken = debitCrop(inv, "wheat", 10);

    expect(taken).toBe(2);
    expect(inv.crops.wheat).toBe(0);
    expect(inv.cropQuality!.wheat).toEqual({ normal: 0, silver: 0, gold: 0 });
  });

  it("no-ops (returns 0) when nothing is on hand", () => {
    const inv = makeInventory();
    expect(debitCrop(inv, "wheat", 3)).toBe(0);
  });

  it("stays a no-op on cropQuality when the inventory never tracked quality for that crop", () => {
    const inv = makeInventory({ crops: { ...ZERO_CROPS, wheat: 3 } });
    const taken = debitCrop(inv, "wheat", 2);
    expect(taken).toBe(2);
    expect(inv.crops.wheat).toBe(1);
    expect(inv.cropQuality).toBeUndefined();
  });

  it("round-trips with bankHarvest: credit then debit leaves crops/cropQuality in sync", () => {
    const inv = makeInventory();
    bankHarvest(inv, "corn", 5, "gold");
    bankHarvest(inv, "corn", 3, "normal");
    expect(inv.crops.corn).toBe(8);

    debitCrop(inv, "corn", 6);

    const q = inv.cropQuality!.corn!;
    expect(q.normal + q.silver + q.gold).toBe(inv.crops.corn);
    expect(inv.crops.corn).toBe(2);
  });

  it("deductCrops is a name-compatible alias that delegates to debitCrop", () => {
    const inv = makeInventory({
      crops: { ...ZERO_CROPS, wheat: 4 },
      cropQuality: { wheat: { normal: 4, silver: 0, gold: 0 } },
    });

    const taken = deductCrops(inv, "wheat", 3);

    expect(taken).toBe(3);
    expect(inv.crops.wheat).toBe(1);
    expect(inv.cropQuality!.wheat).toEqual({ normal: 1, silver: 0, gold: 0 });
  });
});
