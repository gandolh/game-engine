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

// =================================================================================================
// M4c — blueprint-widened loot (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md)
// =================================================================================================

describe("rollLoot — M4c extraPool", () => {
  const BLUEPRINT_ITEM: Item = { id: "test-blueprint-item", name: "Testă de test", bonus: { atk: 99 } };

  it("defaults to [] and stays byte-identical to a bare rollLoot(rng, tier) call", () => {
    for (const tier of TIERS) {
      const a = rollLoot(createRng(11).fork(`z:${tier}`), tier);
      const b = rollLoot(createRng(11).fork(`z:${tier}`), tier, []);
      expect(a).toEqual(b);
    }
  });

  it("a non-empty extraPool CAN be offered (widens the better pool, doesn't just get ignored)", () => {
    // The extra item is drawn deterministically for SOME seed once the better pool is favored
    // heavily enough (boss tier) — search a small seed range for one that offers it.
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const items = rollLoot(createRng(seed), "boss", [BLUEPRINT_ITEM]);
      if (items.some((i) => i.id === BLUEPRINT_ITEM.id)) found = true;
    }
    expect(found).toBe(true);
  });

  it("still returns exactly 3 DISTINCT items with an enlarged pool", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const items = rollLoot(createRng(seed), "boss", [BLUEPRINT_ITEM]);
      expect(items.length).toBe(3);
      expect(new Set(items.map((i) => i.id)).size).toBe(3);
    }
  });

  it("is deterministic: same (seed, tier, extraPool) -> identical offers", () => {
    const a = rollLoot(createRng(3).fork("ep"), "elite", [BLUEPRINT_ITEM]);
    const b = rollLoot(createRng(3).fork("ep"), "elite", [BLUEPRINT_ITEM]);
    expect(a).toEqual(b);
  });

  it("multiple extra items can all appear across enough draws (not just the first)", () => {
    const extra2: Item = { id: "test-blueprint-item-2", name: "Testă de test 2", bonus: { block: 99 } };
    const seenIds = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const item of rollLoot(createRng(seed), "boss", [BLUEPRINT_ITEM, extra2])) seenIds.add(item.id);
    }
    expect(seenIds.has(BLUEPRINT_ITEM.id)).toBe(true);
    expect(seenIds.has(extra2.id)).toBe(true);
  });
});
