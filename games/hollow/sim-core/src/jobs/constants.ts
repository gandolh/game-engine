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
  // chunk hollow-15's two care roles. Pure-aptitude fit alone keeps them rare
  // (their blends are middling for most genomes); the corpse-backlog / sick-
  // count demand nudge below is what actually staffs them when the town needs
  // them (assignment-system.ts). Listed AFTER the productive roles so a strict
  // fit tie still prefers a productive role (fixed-order tie-break).
  "grave-digger",
  "medic",
];

// --- role-fit weights (see header; each blend sums to 1.0) -------------------

export const ROLE_CRAFTER_MATERIAL_WEIGHT = 0.7;
export const ROLE_CRAFTER_CURIOSITY_WEIGHT = 0.3;
export const ROLE_TEACHER_CURIOSITY_WEIGHT = 0.6;
export const ROLE_TEACHER_SOCIABILITY_WEIGHT = 0.4;
export const ROLE_CARETAKER_LOYALTY_WEIGHT = 0.6;
export const ROLE_CARETAKER_SOCIABILITY_WEIGHT = 0.4;
// chunk hollow-15 care roles (blends sum to 1.0):
//   grave-digger — a dutiful, industrious worker for a grim job.
//   medic — a caring knowledge-worker (curiosity + loyalty, distinct from the
//     teacher's curiosity+sociability blend so the two don't perfectly tie).
export const ROLE_GRAVEDIGGER_INDUSTRIOUSNESS_WEIGHT = 0.6;
export const ROLE_GRAVEDIGGER_LOYALTY_WEIGHT = 0.4;
export const ROLE_MEDIC_CURIOSITY_WEIGHT = 0.6;
export const ROLE_MEDIC_LOYALTY_WEIGHT = 0.4;

// --- demand nudge (see header) -----------------------------------------------

export const JOBS_DEMAND_PERCAPITA_TARGET = 5;
export const JOBS_DEMAND_BIAS_WEIGHT = 0.3;

// --- care-role demand nudge (chunk hollow-15) --------------------------------
//
// A town-wide backlog signal (NOT per-community stockpile like the gatherer
// demand above): the count of unburied corpses drives grave-digger demand, the
// count of sick agents drives medic demand, each clamped to [0,1] against its
// target (a small backlog already means "we need someone"). The bias weight is
// larger than JOBS_DEMAND_BIAS_WEIGHT so a genuine backlog reliably flips the
// best-fit LED-community member into the role (an unstaffed graveyard/clinic is
// a fast-compounding problem — rot → disease → more corpses), while still
// bounded so it can't override a strong aptitude mismatch across the board.
// Demand ramps PROPORTIONALLY to backlog size (corpse count / target, clamped):
// a target of 4 means routine death-churn (~1-3 unburied at a time) yields only
// a MODERATE grave-digger pull — leaving room for medics to win for the sick —
// while a genuine backlog (an outbreak's bodies piling up) saturates it and
// floods grave-diggers. Tuned empirically (headless, seeds 7/101): too low a
// target (1, "saturate on the first body") flipped the whole town to
// grave-diggers and starved the medic role of any patient; too high let corpses
// accumulate into a runaway plague. At target 4 both roles stay active and the
// population is bounded across seeds.
export const JOBS_CORPSE_DEMAND_TARGET = 4;
export const JOBS_SICK_DEMAND_TARGET = 2;
/** Grave-digger's demand bias is slightly STRONGER than the medic's so that,
 *  when a corpse backlog and an outbreak saturate both demands at once, burial
 *  (which removes the disease SOURCE) edges out treatment (downstream
 *  mitigation) — without a strong tilt a high-curiosity town flips everyone to
 *  medic, never buries its dead, and the outbreak self-perpetuates (observed).
 *  The margin is deliberately SMALL (0.7 vs 0.6, paired with the proportional
 *  corpse target above) so medics still win when the corpse backlog is light
 *  but people are sick — keeping BOTH roles active rather than one dominating.
 *  Over-staffing grave-diggers is harmless anyway: the survival ladder
 *  (food/rest) always pre-empts the job routine, so a grave-digger still feeds
 *  itself; a gatherer job only adds STOCKPILE surplus. */
export const JOBS_GRAVEDIGGER_DEMAND_BIAS_WEIGHT = 0.7;
export const JOBS_MEDIC_DEMAND_BIAS_WEIGHT = 0.6;

/** Care roles' pure-aptitude fit is scaled DOWN by this factor so that, with
 *  NO backlog (demand 0), a care role never out-scores a genuine productive
 *  specialist — the roles stay dormant until the corpse/sick demand nudge
 *  lifts them (the design intent: "demand-driven, rare without demand"). With
 *  the scale at 0.5 a care role tops out near 0.5 on fit alone, below any real
 *  specialist's 0.7+, but a full demand nudge (JOBS_CARE_DEMAND_BIAS_WEIGHT)
 *  reliably lifts the best-fit member above the productive roles when bodies
 *  pile up or an outbreak spreads. Keeps the pre-hollow-15 5-role routing
 *  byte-identical for any demand-free assignment (sim-bootstrap.jobs.test.ts). */
export const ROLE_CARE_FIT_SCALE = 0.5;

// --- production (see header) -------------------------------------------------

export const JOBS_PRODUCTION_SURPLUS_FRACTION = 0.5;
export const JOBS_FOOD_WORK_SESSION_TARGET = SURPLUS_FOOD_THRESHOLD * 2;

// --- social-verb role bias (see header) --------------------------------------

export const ROLE_SHARE_BIAS = 0.15;
export const ROLE_TEACH_BIAS = 0.15;
export const ROLE_TEACH_COMMUNITY_BONUS = 0.2;
export const ROLE_CARETAKER_BIAS = 0.15;
export const ROLE_CARETAKER_NEEDY_SELECTION_WEIGHT = 0.2;
