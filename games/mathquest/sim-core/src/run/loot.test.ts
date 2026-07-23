/**
 * MateQuest M4a — `run/loot.ts` unit tests
 * (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md). M4b
 * (corpus/todos/2026-07-23-mathquest-M4b-lifelines.md) extends this with lifeline-grant coverage
 * at the bottom of the file.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { foldItemBonus, rollLoot, toItemView, type Item, type LootTier } from "./loot";
import { ZERO_STATS } from "./progression";

const TIERS: readonly LootTier[] = ["combat", "elite", "boss"];

describe("rollLoot", () => {
  it("returns 3 DISTINCT items", () => {
    for (const tier of TIERS) {
      const items = rollLoot(createRng(1).fork(`t:${tier}`), tier);
      expect(items.length).toBe(3);
      expect(new Set(items.map((i) => i.id)).size).toBe(3);
    }
  });

  it("is deterministic: same (seed, tier) -> identical 3 offers", () => {
    for (const tier of TIERS) {
      const a = rollLoot(createRng(7).fork(`x:${tier}`), tier);
      const b = rollLoot(createRng(7).fork(`x:${tier}`), tier);
      expect(a).toEqual(b);
    }
  });

  it("different seeds can produce different offers (not a constant roll)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      seen.add(rollLoot(createRng(seed), "combat").map((i) => i.id).join(","));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("every offered item carries a non-empty bonus OR a lifeline grant (M4b: pure-lifeline items have bonus:{})", () => {
    // Pre-M4b every item had a non-empty stat bonus. M4b intentionally adds pure-lifeline items
    // (bonus:{}, a lifeline grant instead) to both pools — so the invariant widens to "carries
    // SOME grant" rather than "carries a stat bonus", without weakening into a tautology (an item
    // with neither would still fail this).
    for (const tier of TIERS) {
      const items = rollLoot(createRng(3).fork(`b:${tier}`), tier);
      for (const item of items) {
        const hasBonus = Object.keys(item.bonus).length > 0;
        expect(hasBonus || item.lifeline !== undefined).toBe(true);
      }
    }
  });

  it("boss rolls skew toward the two-stat 'better' pool more than plain combat rolls", () => {
    // A statistical check, not an exact one — sample many rolls per tier and compare the average
    // number of stats granted per offered item (better-pool items grant 2, common-pool 1).
    function avgStatCount(tier: LootTier, samples: number): number {
      let total = 0;
      let count = 0;
      for (let seed = 1; seed <= samples; seed++) {
        const items = rollLoot(createRng(seed).fork(`avg:${tier}`), tier);
        for (const item of items) {
          total += Object.keys(item.bonus).length;
          count += 1;
        }
      }
      return total / count;
    }
    const combatAvg = avgStatCount("combat", 300);
    const bossAvg = avgStatCount("boss", 300);
    expect(bossAvg).toBeGreaterThan(combatAvg);
  });
});

describe("toItemView", () => {
  it("projects id/name/bonus verbatim (an Item has no OTHER secret fields)", () => {
    const [item] = rollLoot(createRng(1), "combat");
    const view = toItemView(item!);
    const expected: ReturnType<typeof toItemView> =
      item!.lifeline !== undefined
        ? { id: item!.id, name: item!.name, bonus: item!.bonus, lifeline: item!.lifeline }
        : { id: item!.id, name: item!.name, bonus: item!.bonus };
    expect(view).toEqual(expected);
  });

  it("(M4b) carries a lifeline grant through verbatim when the item has one", () => {
    const item: Item = { id: "test-item", name: "Test", bonus: {}, lifeline: { kind: "hint", charges: 2 } };
    expect(toItemView(item)).toEqual({ id: "test-item", name: "Test", bonus: {}, lifeline: { kind: "hint", charges: 2 } });
  });

  it("(M4b) omits the lifeline key entirely (not `lifeline: undefined`) when the item has none", () => {
    const item: Item = { id: "test-item2", name: "Test2", bonus: { atk: 1 } };
    const view = toItemView(item);
    expect(Object.prototype.hasOwnProperty.call(view, "lifeline")).toBe(false);
  });
});

describe("foldItemBonus", () => {
  it("adds a single-stat bonus into ZERO_STATS", () => {
    expect(foldItemBonus(ZERO_STATS, { atk: 2 })).toEqual({ atk: 2, maxHp: 0, block: 0, heal: 0 });
  });

  it("adds a multi-stat bonus in one fold", () => {
    expect(foldItemBonus(ZERO_STATS, { maxHp: 4, block: 2 })).toEqual({
      atk: 0,
      maxHp: 4,
      block: 2,
      heal: 0,
    });
  });

  it("accumulates across repeated folds without mutating the input", () => {
    const before = { atk: 1, maxHp: 0, block: 0, heal: 0 };
    const snapshot = { ...before };
    const after = foldItemBonus(before, { atk: 2, heal: 1 });
    expect(before).toEqual(snapshot); // pure — input untouched
    expect(after).toEqual({ atk: 3, maxHp: 0, block: 0, heal: 1 });
  });

  it("an empty bonus (Partial<StatBonuses> = {}) changes nothing", () => {
    const stats = { atk: 1, maxHp: 2, block: 3, heal: 4 };
    expect(foldItemBonus(stats, {})).toEqual(stats);
  });
});
