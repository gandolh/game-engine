import type { GameEntity, SkillKind } from "../components";
import { zeroSkills } from "../components";

/**
 * Pure skill math and XP mutator. No per-tick System — XP is granted at ACT resolve sites.
 * 10 levels, mild quadratic curve (threshold(n) = 5*(n-1)*n): early levels quick, later slow.
 */

/** Highest attainable skill level. */
export const MAX_SKILL_LEVEL = 10;

/** Cumulative XP per level: L1:0 L2:10 L3:30 L4:60 L5:100 L6:150 L7:210 L8:280 L9:360 L10:450 */
export const SKILL_LEVEL_XP: readonly number[] = (() => {
  const out: number[] = [];
  for (let level = 1; level <= MAX_SKILL_LEVEL; level++) {
    out.push(5 * (level - 1) * level);
  }
  return out;
})();

export function skillLevel(xp: number): number {
  let level = 1;
  for (let i = 1; i < SKILL_LEVEL_XP.length; i++) {
    if (xp >= SKILL_LEVEL_XP[i]!) level = i + 1;
    else break;
  }
  return level;
}

/** 0..1 scalar: (level-1)/(MAX-1). Common lever for all per-axis bonus functions. */
export function skillProgress(xp: number): number {
  return (skillLevel(xp) - 1) / (MAX_SKILL_LEVEL - 1);
}

/** Farming → additive husbandry shift fed to computeQuality; +0.18 max so it compounds with but never dwarfs watering/decoration. */
export const FARMING_QUALITY_BONUS_MAX = 0.18;
export function farmingQualityBonus(xp: number): number {
  return skillProgress(xp) * FARMING_QUALITY_BONUS_MAX;
}

/** Farming → growth-rate multiplier (1.0..1.12); +12% at max level. */
export const FARMING_GROWTH_BONUS_MAX = 0.12;
export function farmingGrowthMultiplier(xp: number): number {
  return 1 + skillProgress(xp) * FARMING_GROWTH_BONUS_MAX;
}

/** Fishing → weight-shift from minnow toward bass+salmon; +0.30 max. */
export const FISHING_RARITY_BONUS_MAX = 0.30;
export function fishingRarityBonus(xp: number): number {
  return skillProgress(xp) * FISHING_RARITY_BONUS_MAX;
}

/** Mining → additive shift to geode/iron-ore drop chances; +0.15 max (split across tiers). */
export const MINING_RARITY_BONUS_MAX = 0.15;
export function miningRarityBonus(xp: number): number {
  return skillProgress(xp) * MINING_RARITY_BONUS_MAX;
}

/** Foraging → gold multiplier (1.0..1.40) on seasonal reward; +40% at max. */
export const FORAGING_GOLD_BONUS_MAX = 0.40;
export function foragingGoldMultiplier(xp: number): number {
  return 1 + skillProgress(xp) * FORAGING_GOLD_BONUS_MAX;
}

export function grantSkillXp(farmer: GameEntity, axis: SkillKind, amount: number): void {
  if (amount <= 0) return;
  if (!farmer.skills) farmer.skills = zeroSkills();
  farmer.skills[axis] += amount;
}

/** Read a farmer's level on one axis (1 if no skills component yet). */
export function farmerSkillLevel(farmer: GameEntity, axis: SkillKind): number {
  return skillLevel(farmer.skills?.[axis] ?? 0);
}
