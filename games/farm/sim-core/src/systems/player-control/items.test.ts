import { describe, it, expect } from "vitest";
import type { Inventory, ResourceInventory } from "../../components";
import { ZERO_CROPS } from "../../economy";
import { zeroFish } from "../../components";
import {
  HOTBAR_SIZE,
  TOTAL_SLOTS,
  defaultItemSlots,
  syncItemSlots,
  resolveItem,
} from "./items";

function makeInventory(over: Partial<Inventory> = {}): Inventory {
  return {
    gold: 0,
    crops: { ...ZERO_CROPS },
    seeds: { ...ZERO_CROPS },
    fish: zeroFish(),
    tools: [
      { kind: "hoe", tier: "wooden", durability: Infinity },
      { kind: "axe", tier: "wooden", durability: Infinity },
      { kind: "pickaxe", tier: "wooden", durability: Infinity },
      { kind: "fishing-rod", tier: "wooden", durability: Infinity },
    ],
    wateringCan: { charges: 7, maxCharges: 10 },
    ...over,
  };
}

const NO_RES: ResourceInventory = { wood: 0, stone: 0, ironOre: 0, geodes: 0 };

describe("item grid layout", () => {
  it("default layout fills the hotbar row with the classic tool+seed order", () => {
    const slots = defaultItemSlots();
    expect(slots).toHaveLength(TOTAL_SLOTS);
    expect(slots.slice(0, HOTBAR_SIZE)).toEqual([
      { kind: "tool", tool: "can" },
      { kind: "tool", tool: "hoe" },
      { kind: "tool", tool: "axe" },
      { kind: "tool", tool: "pickaxe" },
      { kind: "tool", tool: "fishing-rod" },
      { kind: "seed", crop: "radish" },
      { kind: "seed", crop: "wheat" },
      { kind: "seed", crop: "pumpkin" },
    ]);

    expect(slots.slice(HOTBAR_SIZE).every((s) => s === null)).toBe(true);
  });

  it("sync appends newly-held items to empty backpack slots without disturbing existing ones", () => {
    const slots = defaultItemSlots();
    const inv = makeInventory({
      crops: { ...ZERO_CROPS, radish: 4 },
      fish: { ...zeroFish(), salmon: 2 },
    });
    const res: ResourceInventory = { ...NO_RES, wood: 9 };

    syncItemSlots(slots, inv, res);

    expect(slots[5]).toEqual({ kind: "seed", crop: "radish" });

    const appended = slots.slice(HOTBAR_SIZE).filter((s) => s !== null);
    expect(appended).toEqual([
      { kind: "crop", crop: "radish" },
      { kind: "fish", fish: "salmon" },
      { kind: "resource", resource: "wood" },
    ]);
  });

  it("sync is idempotent and never removes a depleted item's slot", () => {
    const slots = defaultItemSlots();
    const inv = makeInventory({ crops: { ...ZERO_CROPS, wheat: 3 } });
    syncItemSlots(slots, inv, NO_RES);
    const firstEmpty = slots.indexOf(null);
    expect(slots[HOTBAR_SIZE]).toEqual({ kind: "crop", crop: "wheat" });

    inv.crops.wheat = 0;
    syncItemSlots(slots, inv, NO_RES);
    expect(slots[HOTBAR_SIZE]).toEqual({ kind: "crop", crop: "wheat" });
    expect(slots.indexOf(null)).toBe(firstEmpty);
  });

  it("resolveItem derives counts and actionability from the inventory", () => {
    const inv = makeInventory({
      seeds: { ...ZERO_CROPS, radish: 2 },
      crops: { ...ZERO_CROPS, pumpkin: 5 },
    });

    const can = resolveItem({ kind: "tool", tool: "can" }, inv, NO_RES);
    expect(can.text).toBe("7/10");
    expect(can.actionable).toBe(true);

    const seed = resolveItem({ kind: "seed", crop: "radish" }, inv, NO_RES);
    expect(seed).toMatchObject({ text: "x2", available: true, actionable: true, frame: "crop/radish/seed" });

    const crop = resolveItem({ kind: "crop", crop: "pumpkin" }, inv, NO_RES);
    expect(crop).toMatchObject({ text: "x5", available: true, actionable: false, frame: "crop/pumpkin/mature" });

    const empty = resolveItem({ kind: "fish", fish: "minnow" }, inv, NO_RES);
    expect(empty).toMatchObject({ text: "x0", available: false, actionable: false });
  });
});
