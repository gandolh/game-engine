/**
 * Social-verb DELIBERATION tunables (chunk hollow-06b) — every dial the
 * villager deliberator's genome-driven verb-choice scoring (agents/social-verbs.ts)
 * pulls from, collected in ONE documented block per social/constants.ts's and
 * economy/constants.ts's "one derivation, not separately-guessed numbers"
 * convention. hollow-06a's `social/constants.ts` tunes what happens once a
 * verb fires; this file tunes WHEN/WHY the deliberator picks one.
 *
 * ── the scoring shape ─────────────────────────────────────────────────────
 * Every `deliberate*<verb>` helper (agents/social-verbs.ts) computes a score
 * as a WEIGHTED AVERAGE of factors that are each already normalized to
 * [0, 1] (genome behavior genes are natively [GENE_MIN, GENE_MAX] = [0, 1];
 * need pressure is `1 - needFraction`; trust/distrust is `relationshipScore`
 * or its complement, already [0, 1]) — each verb's own per-factor weights
 * sum to 1.0, so the resulting score is itself always in [0, 1] and
 * comparable ACROSS verbs without any extra rescaling. A "neutral" agent
 * (every behavior gene at 0.5, neutral 0.5 trust toward everyone, no need
 * pressure) therefore scores close to 0.5 on every verb — clearly below
 * `SOCIAL_ACTION_MIN_SCORE` (see below), so an unremarkable agent falls back
 * to `work`, and only a genome/state combination that's ACTUALLY skewed
 * (high aggression + low trust, high loyalty + surplus, etc.) clears the
 * gate. This is what makes the flip test (hollow-06b's brief) work: forcing
 * a cohort's genes to the extremes moves their scores well past 0.5 in a
 * predictable direction, while the opposite cohort's scores stay suppressed.
 *
 * ── candidate discovery ───────────────────────────────────────────────────
 * `SOCIAL_CANDIDATE_RADIUS_TILES` bounds which neighbors (from the per-tick
 * `HollowDeliberationContext.neighbors` index — agents/registry.ts) a
 * deliberator considers "nearby" for targeting. Slightly wider than
 * `WITNESS_PROXIMITY_TILES`/`PAIRBOND_PROXIMITY_TILES` (both 4 — social/
 * constants.ts, family/constants.ts): those gate INSTANTANEOUS bystander/
 * pairing checks re-evaluated every tick regardless of intent, whereas a
 * social deliberator is actively CHOOSING a target this tick and benefits
 * from a slightly wider explorable set even before agents have drifted into
 * a tight cluster around a shared resource node. Measured empirically
 * (this chunk's anti-inert/legacy-regression runs): too wide (10+) let a
 * single antagonistic event's witness fan-out (social/witness-system.ts)
 * reach and re-trigger against a much larger slice of the population each
 * tick, feeding a runaway trust-erosion spiral; 6 keeps candidate discovery
 * genuinely local without starving it entirely.
 *
 * ── surplus / deficit thresholds ──────────────────────────────────────────
 * Because `runWork`/`runSeekFood` (systems/act.ts) harvest straight into the
 * matching need and immediately consume what they just added, a SOLO agent's
 * own `inventory.goods` normally nets to zero — it only accumulates real
 * stock via a social transfer (`help_labor` deposits materials into the
 * TARGET without consuming them; `gift`/`steal`/`trade` move existing stock
 * around). `SURPLUS_MATERIAL_THRESHOLD`/`SURPLUS_FOOD_THRESHOLD` are
 * therefore deliberately small (a handful of units, not a huge stockpile) —
 * "meaningfully more than the transient zero", not "hoarding a fortune".
 * `RIVAL_MATERIAL_SCALE` normalizes "how materially successful is this
 * neighbor" for sabotage's rivalry factor and help_labor's "poorer peer"
 * factor: it's exactly one full `wealth`-need refill's worth of materials
 * (`NEED_MAX / WEALTH_PER_MATERIAL_UNIT` = 100/2 = 50 — economy/
 * constants.ts), i.e. "as much as a single completed help_labor deposits",
 * so a neighbor sitting on that much materials reads as "doing well".
 *
 * ── trust thresholds ──────────────────────────────────────────────────────
 * `relationshipScore`'s scale is UNIT_TRUST_SCALE (0..1, neutral 0.5).
 * `LOW_TRUST_THRESHOLD` gates rumor's "cheap antagonism" (mildly distrusted
 * is enough to gossip); `VERY_LOW_TRUST_THRESHOLD` gates attack's hard floor
 * — deliberately far below neutral so attack requires a GENUINELY curdled
 * relationship, keeping it rare per the brief's explicit instruction, on top
 * of also needing high `aggression` to clear `SOCIAL_ACTION_MIN_SCORE`.
 * `NEUTRAL_TRUST` is `UNIT_TRUST_SCALE.neutral` restated as a plain number
 * (avoids importing the engine's `RelationshipScale` object just to read one
 * field at every call site) — trade's "neutral-to-positive trust" gate reads
 * against it directly.
 *
 * ── the gate ──────────────────────────────────────────────────────────────
 * `SOCIAL_ACTION_MIN_SCORE` = 0.6 — comfortably above the ~0.5 a neutral
 * genome/state scores (see "the scoring shape" above), so social action is
 * a genuine choice, not the default; below it, `work` remains the fallback
 * (unchanged from hollow-03/05's ladder). It sits close enough to 0.5 that
 * a genuinely elevated-but-not-forced-to-the-max genome (e.g. one gene at
 * ~0.7-1 with the rest still neutral) can clear it once a personality GATE
 * (below) is also satisfied — a hard gate does the real "who even tries
 * this" filtering; the score threshold on top just avoids acting on a
 * merely-lukewarm case.
 *
 * ── personality GATES (hard preconditions, not just weights) ─────────────
 * A weighted-average score alone under-constrains WHO even considers a
 * verb: some candidate-side factors (e.g. help_labor's "poorer" — nearly
 * every agent starts with 0 `materials`, since a solo agent's own inventory
 * nets to zero, see above) are near-1 for almost the whole population almost
 * all the time, which would make a purely-weighted score fire for agents
 * whose OWN genome is entirely unremarkable. Each verb below therefore also
 * has a HARD gate — a minimum on the single behavior gene that verb is
 * "about" — checked BEFORE the weighted score is even computed, independent
 * of how favorable the candidate-side factors look. This is what makes the
 * flip test's forced-genome cohorts cleanly separate (an aggressive-cohort
 * agent's `loyalty`/`sociability` gate failure suppresses cooperative verbs
 * regardless of how "poor" its neighbors look) AND keeps a randomly-seeded
 * founder population's rarer, riskier verbs (attack above all) rare in
 * practice: `ATTACK_AGGRESSION_GATE` (0.99 — practically "must roll at the
 * very top of the range", since a continuous `rng.range(0,1)` draw almost
 * never lands there) + `VERY_LOW_TRUST_THRESHOLD` (0.05, tightened from an
 * earlier 0.25 across several build-log iterations) together mean attack
 * requires BOTH a genuinely extreme `aggression` draw AND a relationship
 * curdled far past what ambient trust decay (`TRUST_DECAY_TOWARD_NEUTRAL_
 * RATE`) lets happen without sustained, repeatedly-witnessed antagonism —
 * measured empirically (this chunk's anti-inert/legacy-regression runs) to
 * keep a 40-founder/600-tick run at ZERO deliberation-triggered attacks
 * under ordinary random genomes, while the flip test's all-`aggression`-
 * forced-to-1 cohort clears both gates easily (and, unchecked, can spiral
 * into serious in-fighting over hundreds of ticks — an intentional, honest
 * consequence of a genuinely hyper-aggressive/disloyal founding population,
 * not a bug).
 */
import { NEED_MAX, WEALTH_PER_MATERIAL_UNIT } from "../economy";

// --- candidate discovery -----------------------------------------------------

export const SOCIAL_CANDIDATE_RADIUS_TILES = 6;

// --- surplus / deficit thresholds --------------------------------------------

export const SURPLUS_MATERIAL_THRESHOLD = 5;
export const SURPLUS_FOOD_THRESHOLD = 5;

/** One full `wealth`-need refill's worth of materials (see header) —
 *  normalizes "materially successful neighbor" for sabotage/help_labor. */
export const RIVAL_MATERIAL_SCALE = NEED_MAX / WEALTH_PER_MATERIAL_UNIT;

// --- trust thresholds (UNIT_TRUST_SCALE 0..1, neutral 0.5) -------------------

export const NEUTRAL_TRUST = 0.5;
export const LOW_TRUST_THRESHOLD = 0.3;
export const VERY_LOW_TRUST_THRESHOLD = 0.05;

// --- the gate -----------------------------------------------------------------

export const SOCIAL_ACTION_MIN_SCORE = 0.6;

// --- personality gates (see header) ------------------------------------------

/** steal requires a genuinely greedy actor. */
export const STEAL_GREED_GATE = 0.6;
/** sabotage requires a genuinely aggressive actor. */
export const SABOTAGE_AGGRESSION_GATE = 0.6;
/** attack requires a near-maximal aggression draw (see header). */
export const ATTACK_AGGRESSION_GATE = 0.99;
/** rumor requires genuinely elevated aggression (low sociability still
 *  contributes to the SCORE — see RUMOR_WEIGHTS — just not as its own
 *  alternate gate; an earlier either/or gate covered too much of a random
 *  population and drove a runaway trust-erosion feedback loop — see the
 *  hollow-06b build log). */
export const RUMOR_AGGRESSION_GATE = 0.8;
/** gift requires at least moderate loyalty. */
export const GIFT_LOYALTY_GATE = 0.45;
/** share requires at least moderate loyalty (on top of community membership). */
export const SHARE_LOYALTY_GATE = 0.45;
/** help_labor requires at least moderate sociability. */
export const HELP_LABOR_SOCIABILITY_GATE = 0.45;
/** teach requires at least a little curiosity. */
export const TEACH_CURIOSITY_GATE = 0.35;

// --- per-verb factor weights (each verb's weights sum to 1.0 — see header) --

/** steal — need pressure dominates (it's a survival-adjacent act), then
 *  greed/aggression/risk, then how little the actor trusts the mark. */
export const STEAL_WEIGHTS = {
  needPressure: 0.35,
  greed: 0.25,
  aggression: 0.15,
  risk: 0.15,
  distrust: 0.1,
} as const;

/** sabotage — aggression + distrust dominate; a smaller rivalry factor
 *  (the target's relative material success) sharpens WHO gets targeted. */
export const SABOTAGE_WEIGHTS = {
  aggression: 0.45,
  distrust: 0.35,
  rivalry: 0.2,
} as const;

/** attack — almost entirely aggression + how curdled the relationship is;
 *  gated separately by `VERY_LOW_TRUST_THRESHOLD` (see header) for rarity. */
export const ATTACK_WEIGHTS = {
  aggression: 0.5,
  distrust: 0.5,
} as const;

/** rumor — cheap antagonism: distrust dominates, with a below-average
 *  sociability and a touch of aggression as secondary contributors. */
export const RUMOR_WEIGHTS = {
  distrust: 0.5,
  lowSociability: 0.3,
  aggression: 0.2,
} as const;

/** gift — the actor's own surplus + loyalty/sociability + how much it
 *  already trusts the recipient. */
export const GIFT_WEIGHTS = {
  ownSurplus: 0.3,
  loyalty: 0.3,
  sociability: 0.2,
  trust: 0.2,
} as const;

/** share — surplus + loyalty only (community membership is a hard gate,
 *  not a graded factor — see deliberateShare). */
export const SHARE_WEIGHTS = {
  ownSurplus: 0.5,
  loyalty: 0.5,
} as const;

/** help_labor — sociability/loyalty dominate, then how much poorer the
 *  candidate looks, then an affinity term (same community, else trust). */
export const HELP_LABOR_WEIGHTS = {
  sociability: 0.3,
  loyalty: 0.25,
  poorer: 0.25,
  affinity: 0.2,
} as const;

/** teach — curiosity/sociability plus the actual skill gap that makes
 *  teaching meaningful (gated: only feasible when the actor IS better). */
export const TEACH_WEIGHTS = {
  curiosity: 0.35,
  sociability: 0.25,
  skillGap: 0.4,
} as const;

/** trade — how well actor/candidate holdings complement each other, plus a
 *  trust factor (gated at neutral-or-better — see deliberateTrade). */
export const TRADE_WEIGHTS = {
  ownSurplus: 0.3,
  ownDeficit: 0.3,
  trust: 0.4,
} as const;
