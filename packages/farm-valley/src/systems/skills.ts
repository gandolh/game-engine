import type { GameEntity, SkillKind } from "../components";
import { zeroSkills } from "../components";

/**
 * brief 43 — per-farm skill progression.
 *
 * This module is PURE math + tiny mutators. There is no per-tick System: skills
 * are earned by the activities the farmer already does, so XP is granted at the
 * ACT resolve sites (see act.ts / harvest.ts) via `grantSkillXp`, and the level
 * + bonus are derived on demand with the pure helpers here. Keeping the math
 * here (and pure) makes the bonuses deterministic — a given activity history
 * always yields the same level and the same bonus — and trivially testable.
 *
 * Curve design (gentle, tuned to a 100-day run):
 *   - 10 levels (1..MAX_SKILL_LEVEL), Stardew-style.
 *   - XP per activity is 1 (one plant, one harvest, one forage, one cast, one
 *     mined rock = 1 XP on the matching axis). A busy farmer does on the order
 *     of a few hundred farming actions over 100 days, so the thresholds below
 *     are spaced so a dedicated farmer reaches the high single-digit levels and
 *     an all-rounder lands mid-table — a legible "I've grown" signal without a
 *     run-warping power spike.
 *   - Thresholds are a mild quadratic (level n needs ~5*n*(n-1) XP), so early
 *     levels come quickly (engagement) and later ones slow down (long tail).
 */

/** Highest attainable skill level. */
export const MAX_SKILL_LEVEL = 10;

/**
 * Cumulative XP required to HAVE REACHED each level (index = level-1). Level 1 is
 * free (0 XP). A mild quadratic: threshold(n) = 5 * (n-1) * n  (n = level).
 *   L1:0  L2:10  L3:30  L4:60  L5:100  L6:150  L7:210  L8:280  L9:360  L10:450
 * A dedicated farmer (≈2–4 farming actions/day) clears L7–L9 by day 100; an
 * all-rounder spreads XP and lands several levels lower per axis. Gentle.
 */
export const SKILL_LEVEL_XP: readonly number[] = (() => {
  const out: number[] = [];
  for (let level = 1; level <= MAX_SKILL_LEVEL; level++) {
    out.push(5 * (level - 1) * level);
  }
  return out;
})();

/**
 * Pure: derive the integer level (1..MAX_SKILL_LEVEL) from an XP counter.
 * Monotonic and deterministic — the heart of the progression.
 */
export function skillLevel(xp: number): number {
  let level = 1;
  for (let i = 1; i < SKILL_LEVEL_XP.length; i++) {
    if (xp >= SKILL_LEVEL_XP[i]!) level = i + 1;
    else break;
  }
  return level;
}

/**
 * Pure: a 0..1 progression scalar = (level-1)/(MAX-1). 0 at level 1, 1 at max.
 * Used as the common lever the per-axis bonus functions scale against, so all
 * bonuses share one gentle shape.
 */
export function skillProgress(xp: number): number {
  return (skillLevel(xp) - 1) / (MAX_SKILL_LEVEL - 1);
}

// ── Per-axis bonus functions (PURE) ───────────────────────────────────────────

/**
 * Farming → quality bonus. Returns an additive shift to the husbandry score fed
 * into computeQuality (harvest.ts), so higher farming makes Silver/Gold more
 * likely. Capped small (+0.18 at max level) so it compounds with — but never
 * dwarfs — watering/decoration husbandry.
 */
export const FARMING_QUALITY_BONUS_MAX = 0.18;
export function farmingQualityBonus(xp: number): number {
  return skillProgress(xp) * FARMING_QUALITY_BONUS_MAX;
}

/**
 * Farming → growth-rate bonus. A small multiplicative speed-up to the daily
 * growth advance (CropGrowthSystem), so a master farmer's crops mature a touch
 * faster. +12% at max level. Returned as the MULTIPLIER (1.0 .. 1.12).
 */
export const FARMING_GROWTH_BONUS_MAX = 0.12;
export function farmingGrowthMultiplier(xp: number): number {
  return 1 + skillProgress(xp) * FARMING_GROWTH_BONUS_MAX;
}

/**
 * Fishing → rarity bonus. Returns a 0..1 weight-shift fraction: that fraction of
 * the calm/normal odds is reallocated from minnow toward bass+salmon (see
 * applyFishingRarityBonus). +0.30 at max level — a real but gentle tilt.
 */
export const FISHING_RARITY_BONUS_MAX = 0.30;
export function fishingRarityBonus(xp: number): number {
  return skillProgress(xp) * FISHING_RARITY_BONUS_MAX;
}

/**
 * Mining → ore/geode bonus. Returns an additive shift applied to the geode and
 * iron-ore drop chances (act.ts handleMineStone), so a master miner pulls more
 * valuable drops. +0.15 total at max level (split across the two tiers).
 */
export const MINING_RARITY_BONUS_MAX = 0.15;
export function miningRarityBonus(xp: number): number {
  return skillProgress(xp) * MINING_RARITY_BONUS_MAX;
}

/**
 * Foraging → gold bonus. Returns a MULTIPLIER (1.0 .. 1.40) on seasonal-forage
 * reward, so a master forager earns up to +40% per forage. Applied in
 * handleForage.
 */
export const FORAGING_GOLD_BONUS_MAX = 0.40;
export function foragingGoldMultiplier(xp: number): number {
  return 1 + skillProgress(xp) * FORAGING_GOLD_BONUS_MAX;
}

// ── XP grant (tiny mutator) ────────────────────────────────────────────────────

/**
 * Grant `amount` XP on `axis` to a farmer, lazily initializing the Skills
 * component. Called from the ACT resolve sites (plant/harvest → farming, forage
 * → foraging, fish → fishing, mine → mining). Deterministic: pure increment of
 * an integer keyed only on the activity that just happened.
 */
export function grantSkillXp(farmer: GameEntity, axis: SkillKind, amount: number): void {
  if (amount <= 0) return;
  if (!farmer.skills) farmer.skills = zeroSkills();
  farmer.skills[axis] += amount;
}

/** Read a farmer's level on one axis (1 if no skills component yet). */
export function farmerSkillLevel(farmer: GameEntity, axis: SkillKind): number {
  return skillLevel(farmer.skills?.[axis] ?? 0);
}
