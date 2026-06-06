// ── Skills (brief 43) ─────────────────────────────────────────────────────────

/**
 * brief 43 — per-farm skill axes. Each is leveled by DOING the matching activity
 * (farming = plant/harvest, foraging = forage, fishing = fish, mining = mine).
 * The skill bonuses are PURE functions of these XP counters (see systems/skills.ts),
 * so determinism is preserved: the same activity history always yields the same
 * level + bonus. No rolls live here — any quality/rarity roll that a bonus shifts
 * still flows through a forked seeded Rng at the resolve site.
 */
export type SkillKind = "farming" | "foraging" | "fishing" | "mining";

export const SKILL_KINDS: readonly SkillKind[] = ["farming", "foraging", "fishing", "mining"];

/**
 * A farmer's accumulated skill XP. One integer counter per axis. Levels are
 * derived (not stored) via `skillLevel(xp)` in systems/skills.ts so there is a
 * single source of truth for the curve. Optional on the farmer so pre-43 saves
 * and bare test fixtures read as all-zero (level 1, no bonus).
 */
export interface Skills {
  farming: number;
  foraging: number;
  fishing: number;
  mining: number;
}

/** A zero-initialized Skills record (level 1 across the board). */
export function zeroSkills(): Skills {
  return { farming: 0, foraging: 0, fishing: 0, mining: 0 };
}
