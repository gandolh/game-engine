import { describe, it, expect } from "vitest";
import { makeInventory, addGoods, takeGoods } from "./inventory";

describe("Inventory goods helpers", () => {
  it("starts empty", () => {
    expect(makeInventory()).toEqual({ goods: {} });
  });

  it("addGoods accumulates by kind and ignores non-positive amounts", () => {
    const inv = makeInventory();
    addGoods(inv, "food", 5);
    addGoods(inv, "food", 3);
    addGoods(inv, "materials", 2);
    addGoods(inv, "food", 0);
    addGoods(inv, "food", -10);
    expect(inv.goods).toEqual({ food: 8, materials: 2 });
  });

  it("takeGoods removes up to what's available and returns the actual amount taken", () => {
    const inv = makeInventory();
    addGoods(inv, "food", 5);
    expect(takeGoods(inv, "food", 3)).toBe(3);
    expect(inv.goods.food).toBe(2);
    expect(takeGoods(inv, "food", 100)).toBe(2);
    expect(inv.goods.food).toBe(0);
    expect(takeGoods(inv, "food", 1)).toBe(0);
    expect(takeGoods(inv, "unknown-kind", 1)).toBe(0);
  });
});
