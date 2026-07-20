/**
 * Occupation — the leader-assigned JOB role (chunk hollow-14b). A small,
 * fixed enum of roles a community's members (or a self-assigning loner)
 * specialize into, biasing (never overriding) the villager deliberator's
 * productive/social choice AFTER the survival ladder (see agents/villager.ts,
 * agents/social-verbs.ts) so gatherers actually path to role-appropriate
 * nodes and specialists lean on the matching existing social verb
 * (share/teach/help_labor/gift).
 *
 * See jobs/assignment-system.ts for how a role is actually chosen: a
 * standing-based community leader assigns members by aptitude fit,
 * demand-nudged by the community's own stockpile shortage; a loner (or a
 * community with no leader yet — the pre-governance bootstrap window)
 * self-assigns by pure aptitude, no demand term.
 *
 * Every spawned agent starts `"unassigned"` (population.ts, family/
 * reproduction-system.ts) — the periodic JOBS-stage assignment pass is what
 * actually sets a real role; nothing here draws any `Rng`.
 */
export const JOB_ROLES = [
  "food-gatherer",
  "material-gatherer",
  "crafter",
  "teacher",
  "caretaker",
  "unassigned",
] as const;
export type JobRole = (typeof JOB_ROLES)[number];

export interface Occupation {
  role: JobRole;
}

/** A fresh, unassigned occupation — every founder/newborn starts here. */
export function makeOccupation(): Occupation {
  return { role: "unassigned" };
}
