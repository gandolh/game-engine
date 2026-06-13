import type { GameEntity, SkillKind } from "../components";
import { zeroSkills } from "../components";

export const MAX_SKILL_LEVEL = 10;

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

export function skillProgress(xp: number): number {
  return (skillLevel(xp) - 1) / (MAX_SKILL_LEVEL - 1);
}

export const FARMING_QUALITY_BONUS_MAX = 0.18;
export function farmingQualityBonus(xp: number): number {
  return skillProgress(xp) * FARMING_QUALITY_BONUS_MAX;
}

export const FARMING_GROWTH_BONUS_MAX = 0.12;
export function farmingGrowthMultiplier(xp: number): number {
  return 1 + skillProgress(xp) * FARMING_GROWTH_BONUS_MAX;
}

export const FISHING_RARITY_BONUS_MAX = 0.30;
export function fishingRarityBonus(xp: number): number {
  return skillProgress(xp) * FISHING_RARITY_BONUS_MAX;
}

export const MINING_RARITY_BONUS_MAX = 0.15;
export function miningRarityBonus(xp: number): number {
  return skillProgress(xp) * MINING_RARITY_BONUS_MAX;
}

export const FORAGING_GOLD_BONUS_MAX = 0.40;
export function foragingGoldMultiplier(xp: number): number {
  return 1 + skillProgress(xp) * FORAGING_GOLD_BONUS_MAX;
}

export function grantSkillXp(farmer: GameEntity, axis: SkillKind, amount: number): void {
  if (amount <= 0) return;
  if (!farmer.skills) farmer.skills = zeroSkills();
  farmer.skills[axis] += amount;
}

export function farmerSkillLevel(farmer: GameEntity, axis: SkillKind): number {
  return skillLevel(farmer.skills?.[axis] ?? 0);
}
