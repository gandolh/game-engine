/**
 * Skills — lived state (chunk hollow-06a): how good an agent has actually
 * gotten at a skill domain through PRACTICE, as opposed to
 * `genome.aptitude`'s heritable CAP on how good it could ever get
 * (components/genome.ts's header). One level per `APTITUDE_SKILLS` key
 * (components/genome.ts), each a float in [0, 1] like aptitude itself so the
 * two are directly comparable — a skill can approach but never exceed its
 * own aptitude cap (see systems/act.ts's `runWork` practice step and
 * `social/act-system.ts`'s `teach` verb, both of which call `practiceSkill`
 * below).
 *
 * `byKind` is a plain `Record<string, number>` (not keyed by the
 * `AptitudeSkill` literal union), mirroring `Genome.behavior`/`.aptitude`'s
 * own shape for the same reason: callers iterate `APTITUDE_SKILLS` to
 * fill/read it, so the type shouldn't fight index-signature variance.
 *
 * Initialized on EVERY spawned agent — founders (population.ts) and
 * newborns (family/reproduction-system.ts) — to all-zero (`makeSkills()`):
 * nobody starts already good at anything, only heritably CAPABLE of
 * becoming good at it.
 */
import { APTITUDE_SKILLS } from "./genome";

export interface Skills {
  byKind: Record<string, number>;
}

/** A fresh skill set, every `APTITUDE_SKILLS` key at 0. */
export function makeSkills(): Skills {
  const byKind: Record<string, number> = {};
  for (const skill of APTITUDE_SKILLS) byKind[skill] = 0;
  return { byKind };
}

/**
 * Nudges `skills[skillKind]` toward `cap` by `rate` of the remaining gap
 * (asymptotic approach — never overshoots, never exceeds `cap`). Shared by
 * `systems/act.ts`'s work-practice step (an agent raises its OWN skill) and
 * `social/act-system.ts`'s `teach` verb (the ACTOR raises the TARGET's
 * skill toward the actor's own level, still capped by the target's own
 * aptitude) — `cap` and `rate` mean different things at each call site, but
 * the update rule is identical, so it lives here once. Mutates `skills`.
 */
export function practiceSkill(skills: Skills, cap: number, skillKind: string, rate: number): void {
  const current = skills.byKind[skillKind] ?? 0;
  skills.byKind[skillKind] = Math.min(cap, current + rate * (cap - current));
}
