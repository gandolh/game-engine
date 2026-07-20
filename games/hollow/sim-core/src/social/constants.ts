/**
 * Social-verb tunables (chunk hollow-06a) — every dial the verb EFFECTS
 * (systems/act.ts's material-yield wiring, social/act-system.ts's
 * `HollowSocialActSystem`, social/witness-system.ts's third-party folding)
 * pull from, collected in ONE documented block per economy/constants.ts's
 * and family/constants.ts's "one derivation, not separately-guessed
 * numbers" convention. This dispatch does NOT choose WHEN a verb fires
 * (dispatch 6b's deliberation does) — only what happens once one does, so
 * none of these numbers are tuned against a deliberation policy that
 * doesn't exist yet.
 *
 * ── the verb-kind vocabulary ─────────────────────────────────────────────
 * `SOCIAL_VERB_KINDS` is the exact set from the brief's "shared
 * intention-kind contract" — `systems/act.ts`'s ACT-stage dispatch checks
 * membership before falling back to its "drop unrecognized kinds" default,
 * so a social intention that hasn't finished yet (e.g. `help_labor`
 * mid-travel) is never clobbered before `HollowSocialActSystem` (registered
 * in the same ACT stage) gets to finish it.
 *
 * ── skill (lived state, not genome) ──────────────────────────────────────
 * `SKILL_MATERIAL` names the one skill domain this dispatch wires a real
 * production effect for. `components/genome.ts`'s `APTITUDE_SKILLS` also
 * lists "food" — deliberately left alone: food harvest yield drives
 * population stability (economy/constants.ts's carefully-swept supply/
 * demand calibration), and this chunk's job is to prove the LEVEL-vs-CAP
 * split matters, not to re-open that calibration.
 * `SKILL_YIELD_BONUS` = 0.5 — a maxed-out worker (skill == aptitude cap ==
 *   1) harvests 1.5x `MATERIAL_HARVEST_PER_TICK`; modest by design so a
 *   fully-practiced agent is noticeably, not absurdly, more productive.
 * `PRACTICE_RATE` = 0.05 — each successful (non-dry) work tick closes 5% of
 *   the remaining gap to the agent's aptitude cap, so an agent starting at
 *   skill 0 reaches ~95% of a cap-1 aptitude in ln(0.05)/ln(0.95) ~= 58
 *   ticks of steady work — comfortably observable within this brief's
 *   "keep tick counts small (<= a few hundred)" test budget.
 * `TEACH_RATE` = 0.25 — a single `teach` tick closes 25% of the gap between
 *   learner and teacher (capped at the learner's own aptitude) — a
 *   deliberately faster path than solo practice (the whole point of the
 *   verb), but still not an instant fill (a test can see the LEARNER not
 *   reach the teacher's level in one shot).
 *
 * ── cooperative-verb trust deltas (UNIT_TRUST_SCALE 0..1, neutral 0.5) ───
 * All in the same ballpark as `TRUST_PROXIMITY_DELTA`/`TRUST_SHARED_NODE_
 * DELTA` (community/constants.ts) so an explicit social verb moves trust
 * noticeably faster than ambient proximity accrual, without maxing the
 * ledger in a single tick.
 */
export const SOCIAL_VERB_KINDS: ReadonlySet<string> = new Set([
  "gift",
  "share",
  "help_labor",
  "teach",
  "trade",
  "steal",
  "sabotage",
  "rumor",
  "attack",
]);

// --- skill (see header) -----------------------------------------------------

export const SKILL_MATERIAL = "material";
export const SKILL_YIELD_BONUS = 0.5;
export const PRACTICE_RATE = 0.05;
export const TEACH_RATE = 0.25;

// --- cooperative-verb trust deltas (see header) -----------------------------

export const GIFT_TRUST_DELTA = 0.08;
export const HELP_TRUST_DELTA = 0.06;
export const TEACH_TRUST_DELTA = 0.05;
export const TRADE_TRUST_DELTA = 0.05;

// --- antagonistic-verb detection + trust hits -------------------------------

/** A coin-flip by design: high enough that repeated theft is reliably
 *  eventually caught (provable in a short test window), and — more
 *  importantly — a genuine midpoint the tests' `stealDetectionProb: 0` /
 *  `1` overrides read as opposite ends of the SAME dial, not degenerate
 *  always/never defaults tuned to different numbers. */
export const STEAL_DETECTION_PROB = 0.5;
/** Direct target->actor trust hit on a DETECTED theft — sharp (several
 *  times a single GIFT's worth) per the brief's "collapses" framing. */
export const STEAL_DETECTED_TRUST_DELTA = 0.3;
/** A witness's trust-toward-actor hit — half the direct victim's hit (they
 *  saw it happen, but weren't the one robbed). */
export const STEAL_WITNESS_TRUST_DELTA = 0.15;

/** Same shape as steal's detection dial — both are "caught in the act"
 *  antagonistic verbs. */
export const SABOTAGE_DETECTION_PROB = 0.5;
export const SABOTAGE_DETECTED_TRUST_DELTA = 0.3;
/** Half of the target's CURRENT material stockpile is destroyed — a
 *  "measurable" hit per the brief, not a token scratch. No third-party
 *  fan-out for this verb (unlike steal/rumor) — the brief only asks for a
 *  direct target->actor trust hit on detection. */
export const SABOTAGE_DESTROY_FRACTION = 0.5;
/** A flat skill-LEVEL cut (out of the 0..1 range) layered on top of the
 *  inventory loss — sabotage also damages the target's production
 *  capability, not just its stockpile. */
export const SABOTAGE_SKILL_PENALTY = 0.1;

/** Full-strength third-party trust hit for a witness within
 *  `WITNESS_PROXIMITY_TILES` of where the rumor was spread. */
export const RUMOR_TRUST_DELTA = 0.1;
/** A witness who is NOT close but already has a relationship-ledger entry
 *  toward the actor ("already connected", per the brief) still hears the
 *  rumor secondhand, at this fraction of full strength — the "distance
 *  decay" the brief asks for, kept to three simple tiers (close / connected
 *  / neither) rather than a continuous falloff, per the brief's "keep the
 *  propagation rule simple" instruction. */
export const RUMOR_CONNECTED_FACTOR = 0.5;
/** Chebyshev-tile radius shared by BOTH RUMOR's and STEAL_DETECTED's
 *  witness fan-out (social/witness-system.ts) — "who overhears this" is the
 *  same question for both. Mirrors PAIRBOND_PROXIMITY_TILES's convention
 *  (family/constants.ts) of a small Chebyshev radius for "close enough
 *  right now". */
export const WITNESS_PROXIMITY_TILES = 4;

/** Most attacks are NOT lethal (a beating, not an execution) — low enough
 *  that `attackLethalityProb: 0` / `1` overrides read as clearly opposite
 *  test scenarios, same rationale as `STEAL_DETECTION_PROB`. */
export const ATTACK_LETHALITY_PROB = 0.15;
/** The harshest single-tick trust hit of any verb — surviving a non-lethal
 *  attack is the most severe non-lethal betrayal there is. */
export const ATTACK_TRUST_DELTA = 0.4;

// --- trade handshake ---------------------------------------------------------

/** This dispatch settles a `trade` intention SYNCHRONOUSLY within the same
 *  ACT pass — both parties' inventories are already knowable that tick, so
 *  there's no need to wait a tick for a "decision" (see
 *  social/act-system.ts's `runTrade` header for why a genuine multi-tick
 *  negotiation — counter-offers, a target that reasons before replying —
 *  is a documented seam for a later brief, not this one's job). The
 *  `OfferLedger` entry this dispatch records is therefore added and
 *  immediately removed the SAME tick; this 1-tick TTL is a defensive floor
 *  only (an offer should never actually survive long enough to be expired
 *  by `OfferLedger.expire()`). */
export const TRADE_OFFER_TTL_TICKS = 1;
