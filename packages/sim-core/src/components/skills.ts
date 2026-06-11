/** Skill axes: leveled by activity. Bonuses are pure functions of XP (systems/skills.ts); no RNG here. */
export type SkillKind = "farming" | "foraging" | "fishing" | "mining";

export const SKILL_KINDS: readonly SkillKind[] = ["farming", "foraging", "fishing", "mining"];

/** Accumulated XP counters. Levels derived by skillLevel(xp) in systems/skills.ts. Optional → all-zero. */
export interface Skills {
  farming: number;
  foraging: number;
  fishing: number;
  mining: number;
}

export function zeroSkills(): Skills {
  return { farming: 0, foraging: 0, fishing: 0, mining: 0 };
}
