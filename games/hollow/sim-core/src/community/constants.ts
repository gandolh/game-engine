/**
 * Community tuning constants — chunk hollow-04. Every threshold here is a
 * DIAL, not a physical law (mirrors economy/constants.ts's framing): pick
 * values that make emergence legible within a few hundred ticks at Hollow's
 * small default population, per the brief's "keep the accrual small and
 * tunable" instruction. Defaults are chosen so the acceptance tests
 * (sim-bootstrap.community.test.ts) can observe formation/dynamics within a
 * handful of community-check cycles without a huge population; production
 * tuning is a later concern (like economy/constants.ts's own derivation,
 * this table can be re-derived wholesale if the target changes).
 *
 * All `HollowSimOptions` community/trust knobs default to these constants
 * (see sim-bootstrap.ts) — override them per-scenario the same way
 * `foodNodeCount` etc. already do for economy/constants.ts.
 */

// --- trust accrual (the BASELINE mechanism this chunk owns — proximity /
// shared activity only; explicit social verbs that also move trust are
// hollow-06's job) ---------------------------------------------------------

/** Trust nudge applied, per tick, to BOTH directions of a pair of agents
 *  standing on the exact same tile this tick ("co-locate"). */
export const TRUST_PROXIMITY_DELTA = 0.02;

/** Extra trust nudge (on top of proximity, if also co-located — the two
 *  stack) applied to every pair of agents whose current top intention
 *  targets the SAME resource node this tick ("shared activity") — this is
 *  what lets agents converging on a node accrue trust even before they've
 *  physically arrived on the same tile. */
export const TRUST_SHARED_NODE_DELTA = 0.02;

/** Fraction of the gap to `UNIT_TRUST_SCALE.neutral` closed per tick for
 *  every KNOWN peer relation (an entry that already exists in the ledger) —
 *  the "decays toward neutral over time" half of the rule. Applied BEFORE
 *  this tick's accrual, so a pair that keeps co-locating nets a small
 *  positive gain each tick while a pair that stops interacting drifts back
 *  to neutral entirely on its own (no accrual ever pushes it back up). This
 *  is also the "distance" half of the rule in effect: agents that don't
 *  co-locate/share activity simply never get the offsetting accrual, so
 *  their relationship net-decays purely from this term.
 */
export const TRUST_DECAY_TOWARD_NEUTRAL_RATE = 0.01;

/** Ledger entries within this distance of neutral are pruned (deleted)
 *  rather than kept at a value indistinguishable from "no relation
 *  recorded yet" — keeps a long-running ledger from growing unboundedly. */
export const TRUST_CLEANUP_EPSILON = 0.0005;

// --- crystallization + dynamics cadence -----------------------------------

/** The community pass is PERIODIC, not every-tick (brief requirement) — the
 *  check interval, in ticks. */
export const COMMUNITY_CHECK_INTERVAL_TICKS = 50;

/** Minimum cluster size to crystallize into a NEW community, and the
 *  minimum size either half of a SPLIT must retain to be viable. */
export const COMMUNITY_MIN_SIZE = 3;

/** A community whose membership drops below this count de-crystallizes
 *  (DISSOLVE). Set equal to COMMUNITY_MIN_SIZE so shrinking below the
 *  formation threshold is exactly what un-forms it. */
export const COMMUNITY_MIN_MEMBERS = 3;

/** Fraction of all possible internal pairs that must clear
 *  COMMUNITY_TRUST_THRESHOLD (mutual, both directions averaged) for a
 *  cluster to count as "dense" enough to crystallize, remain intact, or
 *  qualify as a SPLIT half. */
export const COMMUNITY_MIN_DENSITY = 0.5;

/** Mutual-trust score (average of both directed scores between a pair) at
 *  or above which an edge exists in the community-detection graph used by
 *  FORM and SPLIT. */
export const COMMUNITY_TRUST_THRESHOLD = 0.6;

/** Combined trust — average of (candidate->members) and (members->candidate)
 *  — at or above which a non-member is invited to GROW into a community. */
export const COMMUNITY_JOIN_TRUST_THRESHOLD = 0.6;

/** A member's average OUTGOING trust to the rest of the community, below
 *  which it defects (LEAVE). Deliberately set ABOVE neutral (0.5), between
 *  neutral and `COMMUNITY_JOIN_TRUST_THRESHOLD` — NOT below neutral. This
 *  chunk's own trust mechanism (proximity/shared-activity accrual, always a
 *  positive delta, plus decay that only ever approaches neutral from
 *  whichever side it started on) can never push a score below neutral on
 *  its own; explicit negative-trust verbs are hollow-06's job. So a member
 *  who stops actively participating (drifts away, stops co-locating) has
 *  its elevated trust decay back DOWN toward neutral — crossing this
 *  threshold from above is what "trust to the group collapses" means under
 *  baseline-only mechanics. Sitting a bit below the join/formation
 *  threshold (rather than equal to it) is also deliberate hysteresis: a
 *  member gets some slack before being kicked out, so trust hovering right
 *  at the formation boundary doesn't flap membership every check. */
export const COMMUNITY_LEAVE_TRUST_THRESHOLD = 0.55;

/** Average cross-trust (both directions, over every member pair) between
 *  two communities' full membership, at or above which they MERGE — also
 *  requires their territories to be within COMMUNITY_MERGE_TERRITORY_RADIUS
 *  of each other ("overlapping", per the brief). */
export const COMMUNITY_MERGE_CROSS_TRUST_THRESHOLD = 0.6;

/** Chebyshev-tile radius within which two communities' territories count as
 *  "overlapping" for the MERGE rule. */
export const COMMUNITY_MERGE_TERRITORY_RADIUS = 2;

// --- norms defaults for newly-formed/split communities --------------------

export const COMMUNITY_DEFAULT_SHARE_RATE = 0.1;
export const COMMUNITY_DEFAULT_COOPERATION_EXPECTATION = COMMUNITY_TRUST_THRESHOLD;

/** Default `admissionPolicy` (chunk hollow-12a) for a newly-formed/split
 *  community — a neutral midpoint (neither wide-open nor closed) for the
 *  votable norm `HollowGovernanceSystem` drifts every governance pass. */
export const COMMUNITY_DEFAULT_ADMISSION_POLICY = 0.5;

// --- belonging need coupling ----------------------------------------------

/** Per-tick replenishment applied to a MEMBER's `belonging` need. */
export const BELONGING_MEMBER_REPLENISH_PER_TICK = 0.6;

/** Per-tick drain applied to a NON-member's (never-joined, excluded, or
 *  dissolved/defected-out) `belonging` need. Applied via `replenishNeed`
 *  with a negative amount (a clamped add) rather than the generic per-need
 *  `decayPerTick` — that stays 0 for `belonging` (economy/constants.ts),
 *  since the generic engine decay system can't condition on community
 *  membership; all the real dynamics live in HollowBelongingSystem. */
export const BELONGING_NONMEMBER_DECAY_PER_TICK = 0.3;
