/**
 * Jobs tuning constants — chunk hollow-14b. Every dial the assignment pass
 * (jobs/assignment-system.ts) and the villager/social-verb role-bias hooks
 * (agents/villager.ts, agents/social-verbs.ts, systems/act.ts) pull from,
 * collected in ONE documented block per social/constants.ts's and
 * governance/constants.ts's "one derivation, not separately-guessed numbers"
 * convention.
 *
 * ── cadence ────────────────────────────────────────────────────────────────
 * `JOBS_ASSIGN_INTERVAL_TICKS` mirrors `GOVERNANCE_INTERVAL_TICKS`'s own
 * cadence (governance/constants.ts) — both run on the SAME ticks by default
 * (JOBS runs right after GOVERNANCE — see sim-bootstrap.ts's scheduler
 * comment) so a freshly-elected leader's very first governance pass already
 * has an up-to-date `leaderId` for that SAME tick's assignment pass to read
 * (no one-tick lag before a new leader starts actually assigning). Left as
 * its own literal (not importing `GOVERNANCE_INTERVAL_TICKS` directly) for
 * the same "deliberate coincidence of defaults, not a hard-coupling" reason
 * governance/constants.ts gives for its own cadence choice.
 *
 * ── role-fit weights ───────────────────────────────────────────────────────
 * Each ASSIGNABLE role's fit score is a weighted blend of genome fields,
 * each blend's weights summing to 1.0 (same "roughly [0,1]-comparable"
 * convention as social/deliberation-constants.ts's verb weights):
 *   - food-gatherer: pure `aptitude.food`.
 *   - material-gatherer: pure `aptitude.material`.
 *   - crafter: mostly `aptitude.material`, with a `curiosity` share (a
 *     crafter is a material specialist who also brings some ingenuity —
 *     see agents/social-verbs.ts's `deliberateShare` header for how crafter
 *     behaves in practice today, a documented seam for real crafting later).
 *   - teacher: `curiosity` + `sociability` (mirrors TEACH_CURIOSITY_GATE/
 *     TEACH_WEIGHTS's own factors — social/deliberation-constants.ts).
 *   - caretaker: `loyalty` + `sociability` (mirrors GIFT_LOYALTY_GATE/
 *     HELP_LABOR_SOCIABILITY_GATE's own factors).
 *
 * ── demand nudge ───────────────────────────────────────────────────────────
 * A LED community (one with a non-null `leaderId`) additionally nudges the
 * gatherer roles by per-capita stockpile shortage: `JOBS_DEMAND_PERCAPITA_
 * TARGET` is the per-member stockpile level considered "secure" (same order
 * of magnitude as `SURPLUS_FOOD_THRESHOLD`/`SURPLUS_MATERIAL_THRESHOLD` —
 * social/deliberation-constants.ts — "enough that a member could share and
 * still be fine"); `JOBS_DEMAND_BIAS_WEIGHT` bounds how much a shortage can
 * shift the argmax versus pure aptitude fit (comparable in scale to a role
 * fit's own [0,1] spread, so a genuine shortage CAN flip a mediocre-fit
 * agent into the shorted role, but never overrides a strong aptitude
 * mismatch on its own). A community with NO leader yet (or a loner,
 * `communityId == null`) never applies this term at all — pure aptitude
 * self-assignment, per the brief's bootstrap rule.
 *
 * ── production (the stockpile-flow seam) ──────────────────────────────────
 * `runWork`'s existing material path (systems/act.ts) harvests straight into
 * the `wealth` need and immediately consumes what it just added — a solo
 * agent's own inventory nets to zero by design (social/deliberation-
 * constants.ts's header). That's exactly why a plain agent can only ever
 * accumulate `share`-able surplus via a social transfer, never solo work.
 * Chunk hollow-14b's whole point is that a JOB should make solo production
 * flow into the shared stockpile, so:
 *   - a material-gatherer/crafter ADDITIONALLY banks `JOBS_PRODUCTION_
 *     SURPLUS_FRACTION` of each harvest as literal, un-consumed inventory
 *     surplus, layered ON TOP of (not replacing) the existing wealth-need
 *     conversion — so the existing conversion/tests are byte-identical for
 *     any agent without this role.
 *   - a food-gatherer's NEW `runWorkFood` path (act.ts) has no pre-existing
 *     consumption step to preserve, so it banks the harvest in full.
 *     `JOBS_FOOD_WORK_SESSION_TARGET` bounds how much it accumulates before
 *     the intention completes and the agent re-plans (mirrors material
 *     work's own completion-on-`wealth`-need-full rule) — set to twice
 *     `SURPLUS_FOOD_THRESHOLD` so a session comfortably crosses the share
 *     verb's surplus gate before handing control back to PERCEIVE/DELIBERATE.
 *
 * ── social-verb role bias ──────────────────────────────────────────────────
 * `ROLE_SHARE_BIAS`/`ROLE_TEACH_BIAS`/`ROLE_CARETAKER_BIAS` are bounded
 * additive score bumps (same shape as `FEUD_DELIBERATION_WEIGHT` —
 * social/feud-constants.ts: on top of, not folded into, the verb's own
 * weighted-average score) applied when the ACTOR's occupation matches the
 * verb's intent — e.g. a food-gatherer sharing FOOD, a teacher teaching, a
 * caretaker helping/gifting. `ROLE_TEACH_COMMUNITY_BONUS`/`ROLE_CARETAKER_
 * NEEDY_SELECTION_WEIGHT` bias TARGET SELECTION the same additive way (a
 * teacher favors a fellow community member; a caretaker favors the neediest
 * — poorest-looking — candidate in range), never a hard override: with no
 * role match every one of these terms is exactly 0, so an unbiased agent's
 * behavior is byte-identical to pre-hollow-14b.
 */
import { SURPLUS_FOOD_THRESHOLD } from "../social/deliberation-constants";
import type { JobRole } from "../components";

// --- cadence -----------------------------------------------------------------

export const JOBS_ASSIGN_INTERVAL_TICKS = 50;

// --- assignable roles (fixed order — also the argmax tie-break order) -------

/** Every role the assignment pass can pick FOR (excludes "unassigned",
 *  which is only ever the pre-assignment default, never a chosen outcome).
 *  Iteration order below is also the deterministic argmax tie-break order
 *  (first-listed wins a strict tie — see assignment-system.ts). */
export const ASSIGNABLE_JOB_ROLES: readonly JobRole[] = [
  "food-gatherer",
  "material-gatherer",
  "crafter",
  "teacher",
  "caretaker",
];

// --- role-fit weights (see header; each blend sums to 1.0) -------------------

export const ROLE_CRAFTER_MATERIAL_WEIGHT = 0.7;
export const ROLE_CRAFTER_CURIOSITY_WEIGHT = 0.3;
export const ROLE_TEACHER_CURIOSITY_WEIGHT = 0.6;
export const ROLE_TEACHER_SOCIABILITY_WEIGHT = 0.4;
export const ROLE_CARETAKER_LOYALTY_WEIGHT = 0.6;
export const ROLE_CARETAKER_SOCIABILITY_WEIGHT = 0.4;

// --- demand nudge (see header) -----------------------------------------------

export const JOBS_DEMAND_PERCAPITA_TARGET = 5;
export const JOBS_DEMAND_BIAS_WEIGHT = 0.3;

// --- production (see header) -------------------------------------------------

export const JOBS_PRODUCTION_SURPLUS_FRACTION = 0.5;
export const JOBS_FOOD_WORK_SESSION_TARGET = SURPLUS_FOOD_THRESHOLD * 2;

// --- social-verb role bias (see header) --------------------------------------

export const ROLE_SHARE_BIAS = 0.15;
export const ROLE_TEACH_BIAS = 0.15;
export const ROLE_TEACH_COMMUNITY_BONUS = 0.2;
export const ROLE_CARETAKER_BIAS = 0.15;
export const ROLE_CARETAKER_NEEDY_SELECTION_WEIGHT = 0.2;
