import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import {
  skillLevel,
  skillProgress,
  MAX_SKILL_LEVEL,
  SKILL_LEVEL_XP,
  farmingQualityBonus,
  farmingGrowthMultiplier,
  fishingRarityBonus,
  miningRarityBonus,
  foragingGoldMultiplier,
  grantSkillXp,
  farmerSkillLevel,
} from "./skills";
import { computeQuality } from "./farming/harvest";
import type { GameEntity } from "../components";

describe("skill curve (pure)", () => {
  it("level 1 at zero XP, monotonic, capped at MAX_SKILL_LEVEL", () => {
    expect(skillLevel(0)).toBe(1);
    let prev = 1;
    for (let xp = 0; xp <= 1000; xp += 7) {
      const lv = skillLevel(xp);
      expect(lv).toBeGreaterThanOrEqual(prev);
      expect(lv).toBeLessThanOrEqual(MAX_SKILL_LEVEL);
      prev = lv;
    }
    expect(skillLevel(SKILL_LEVEL_XP[MAX_SKILL_LEVEL - 1]!)).toBe(MAX_SKILL_LEVEL);
    expect(skillLevel(1_000_000)).toBe(MAX_SKILL_LEVEL); 
  });

  it("each threshold lands exactly on its level boundary", () => {
    for (let level = 1; level <= MAX_SKILL_LEVEL; level++) {
      expect(skillLevel(SKILL_LEVEL_XP[level - 1]!)).toBe(level);
      if (level > 1) {

        expect(skillLevel(SKILL_LEVEL_XP[level - 1]! - 1)).toBe(level - 1);
      }
    }
  });

  it("skillProgress is 0 at level 1 and 1 at max level", () => {
    expect(skillProgress(0)).toBe(0);
    expect(skillProgress(SKILL_LEVEL_XP[MAX_SKILL_LEVEL - 1]!)).toBeCloseTo(1);
  });
});

describe("skill bonuses (pure, monotonic, gentle)", () => {
  const maxXp = SKILL_LEVEL_XP[MAX_SKILL_LEVEL - 1]!;

  it("farming quality bonus rises 0 → +0.18", () => {
    expect(farmingQualityBonus(0)).toBe(0);
    expect(farmingQualityBonus(maxXp)).toBeCloseTo(0.18);
    expect(farmingQualityBonus(maxXp)).toBeGreaterThan(farmingQualityBonus(SKILL_LEVEL_XP[2]!));
  });

  it("farming growth multiplier rises 1.0 → 1.12", () => {
    expect(farmingGrowthMultiplier(0)).toBe(1);
    expect(farmingGrowthMultiplier(maxXp)).toBeCloseTo(1.12);
  });

  it("fishing rarity bonus rises 0 → 0.30", () => {
    expect(fishingRarityBonus(0)).toBe(0);
    expect(fishingRarityBonus(maxXp)).toBeCloseTo(0.30);
  });

  it("mining rarity bonus rises 0 → 0.15", () => {
    expect(miningRarityBonus(0)).toBe(0);
    expect(miningRarityBonus(maxXp)).toBeCloseTo(0.15);
  });

  it("foraging gold multiplier rises 1.0 → 1.40", () => {
    expect(foragingGoldMultiplier(0)).toBe(1);
    expect(foragingGoldMultiplier(maxXp)).toBeCloseTo(1.40);
  });
});

describe("grantSkillXp", () => {
  it("lazily initializes Skills and accumulates per axis (level rises)", () => {
    const farmer: GameEntity = {};
    expect(farmerSkillLevel(farmer, "farming")).toBe(1);

    for (let i = 0; i < 30; i++) grantSkillXp(farmer, "farming", 1);
    expect(farmer.skills?.farming).toBe(30);
    expect(farmerSkillLevel(farmer, "farming")).toBe(3);

    expect(farmerSkillLevel(farmer, "fishing")).toBe(1);
  });

  it("ignores non-positive grants", () => {
    const farmer: GameEntity = {};
    grantSkillXp(farmer, "mining", 0);
    grantSkillXp(farmer, "mining", -5);
    expect(farmer.skills).toBeUndefined();
  });
});

describe("farming skill measurably raises quality odds (deterministic)", () => {
  it("a high-farming farmer earns more Silver/Gold over the same plots + seed than a novice", () => {

    const N = 200;
    const novice = createRng(7).fork("crop-quality");
    const master = createRng(7).fork("crop-quality");
    let noviceUp = 0;
    let masterUp = 0;

    const inputs = [3, 4, 2.4, 1, 0] as const; 
    for (let i = 0; i < N; i++) {
      const qN = computeQuality(inputs[0], inputs[1], inputs[2], inputs[3], inputs[4], novice, 0);
      const qM = computeQuality(inputs[0], inputs[1], inputs[2], inputs[3], inputs[4], master, farmingQualityBonus(SKILL_LEVEL_XP[MAX_SKILL_LEVEL - 1]!));
      if (qN !== "normal") noviceUp++;
      if (qM !== "normal") masterUp++;
    }
    expect(masterUp).toBeGreaterThan(noviceUp);
  });
});
