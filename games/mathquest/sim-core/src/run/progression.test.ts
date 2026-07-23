/**
 * MateQuest M4a — `run/progression.ts` unit tests
 * (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md).
 */
import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import {
  describeUpgrade,
  offerUpgrades,
  UPGRADES,
  xpForSolve,
  xpToNext,
  ZERO_STATS,
  type UpgradeKind,
} from "./progression";
import type { Grade } from "../combat/types";

const ALL_KINDS: readonly UpgradeKind[] = ["hp", "atk", "block", "heal"];

describe("xpForSolve", () => {
  it("equals the grade (hard branches reward more)", () => {
    for (const grade of [1, 2, 3, 4] as const) {
      expect(xpForSolve(grade)).toBe(grade);
    }
  });
});

describe("xpToNext", () => {
  it("is 5 * level (L1->2: 5, L2->3: 10, L3->4: 15, ...)", () => {
    expect(xpToNext(1)).toBe(5);
    expect(xpToNext(2)).toBe(10);
    expect(xpToNext(3)).toBe(15);
    expect(xpToNext(10)).toBe(50);
  });
});

describe("UPGRADES", () => {
  it("hp: +6 maxHp, everything else unchanged", () => {
    expect(UPGRADES.hp.apply(ZERO_STATS)).toEqual({ atk: 0, maxHp: 6, block: 0, heal: 0 });
  });
  it("atk: +2 atk", () => {
    expect(UPGRADES.atk.apply(ZERO_STATS)).toEqual({ atk: 2, maxHp: 0, block: 0, heal: 0 });
  });
  it("block: +3 block", () => {
    expect(UPGRADES.block.apply(ZERO_STATS)).toEqual({ atk: 0, maxHp: 0, block: 3, heal: 0 });
  });
  it("heal: +3 heal", () => {
    expect(UPGRADES.heal.apply(ZERO_STATS)).toEqual({ atk: 0, maxHp: 0, block: 0, heal: 3 });
  });
  it("applies are pure — never mutate the input StatBonuses", () => {
    const before = { atk: 1, maxHp: 2, block: 3, heal: 4 };
    const snapshot = { ...before };
    UPGRADES.atk.apply(before);
    expect(before).toEqual(snapshot);
  });
  it("stack additively across repeated applies", () => {
    let stats = ZERO_STATS;
    stats = UPGRADES.atk.apply(stats);
    stats = UPGRADES.atk.apply(stats);
    expect(stats.atk).toBe(4);
  });
});

describe("describeUpgrade", () => {
  it("returns display-ready RO text for every kind, keyed correctly", () => {
    for (const kind of ALL_KINDS) {
      const offer = describeUpgrade(kind);
      expect(offer.kind).toBe(kind);
      expect(offer.label.length).toBeGreaterThan(0);
      expect(offer.desc.length).toBeGreaterThan(0);
    }
  });

  it("(M5 i18n) localizes to EN, differs from RO, and defaults to RO", () => {
    for (const kind of ALL_KINDS) {
      const ro = describeUpgrade(kind, "ro");
      const en = describeUpgrade(kind, "en");
      expect(describeUpgrade(kind)).toEqual(ro); // default = RO
      expect(en.kind).toBe(kind);
      expect(en.label.length).toBeGreaterThan(0);
      expect(en.desc.length).toBeGreaterThan(0);
      expect(en.label).not.toBe(ro.label); // every label genuinely translated
    }
  });
});

describe("offerUpgrades", () => {
  it("returns `count` DISTINCT kinds", () => {
    const rng = createRng(1);
    const offers = offerUpgrades(rng, 2);
    expect(offers.length).toBe(2);
    expect(new Set(offers).size).toBe(2);
    for (const k of offers) expect(ALL_KINDS).toContain(k);
  });

  it("defaults to count=2", () => {
    const rng = createRng(1);
    expect(offerUpgrades(rng).length).toBe(2);
  });

  it("can return all 4 distinct kinds when asked", () => {
    const rng = createRng(1);
    const offers = offerUpgrades(rng, 4);
    expect(new Set(offers)).toEqual(new Set(ALL_KINDS));
  });

  it("is deterministic: same seed -> identical offers", () => {
    const a = offerUpgrades(createRng(42), 2);
    const b = offerUpgrades(createRng(42), 2);
    expect(a).toEqual(b);
  });

  it("different seeds can produce different offers (not a constant)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) seen.add(offerUpgrades(createRng(seed), 2).join(","));
    expect(seen.size).toBeGreaterThan(1);
  });
});

// A tiny cross-check that xpForSolve's grade-scaling composes sensibly with xpToNext (used by
// sim-bootstrap.ts's level-up loop) — N correct solves at grade g cross the level-1 threshold
// (5 xp) once N*g >= 5.
describe("xpForSolve + xpToNext composition", () => {
  it("N correct grade-g solves cross the level-1 threshold exactly when N*g >= xpToNext(1)", () => {
    const grade: Grade = 2;
    const solvesNeeded = Math.ceil(xpToNext(1) / xpForSolve(grade));
    expect(solvesNeeded * xpForSolve(grade)).toBeGreaterThanOrEqual(xpToNext(1));
    expect((solvesNeeded - 1) * xpForSolve(grade)).toBeLessThan(xpToNext(1));
  });
});
