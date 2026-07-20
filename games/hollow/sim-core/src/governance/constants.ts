/**
 * Governance tuning constants — chunk hollow-12a. Every threshold here is a
 * DIAL, not a physical law (mirrors community/constants.ts's and
 * economy/constants.ts's framing): picked so leadership contests, norm
 * drift, and sanctions are all observable within a handful of governance
 * passes at Hollow's small default population, not a production-tuned
 * final balance.
 */

// --- cadence -----------------------------------------------------------------

/** The governance pass is PERIODIC, mirroring the community pass's own
 *  cadence (`COMMUNITY_CHECK_INTERVAL_TICKS`) — both run on the SAME ticks
 *  by default (GOVERNANCE runs first — see sim-bootstrap.ts's scheduler
 *  comment) so this pass's trust/norm/sanction effects are visible to the
 *  SAME tick's community LEAVE/SPLIT dynamics, not a tick late. Overridable
 *  independently via `governanceIntervalTicks` (e.g. a faster cadence in a
 *  narrow test), but left equal to the community interval by default rather
 *  than importing that constant directly — the two systems' cadences are a
 *  DELIBERATE COINCIDENCE of defaults, not a hard-coupling; a future brief
 *  could decouple them without this constant needing to change meaning. */
export const GOVERNANCE_INTERVAL_TICKS = 50;

// --- standing (sub-pass a) ----------------------------------------------------
// Each ingredient is normalized into roughly [0, 1] (via its own
// `_NORMALIZER`, clamped) before weighting, so the four `_WEIGHT` constants
// below are directly comparable "how much of the final [0, 1]-ish standing
// score come from this ingredient" shares. They sum to 1.0 (not enforced in
// code — a later re-tune is free to let them drift from that, same
// "re-derive wholesale" allowance as economy/constants.ts).

/** Lifetime cumulative goods shared into the community stockpile (the
 *  `share` verb — see social/act-system.ts's `runShare`) at or above which
 *  the contribution ingredient saturates at 1.0. Deliberately a LIFETIME
 *  (never-decaying) tally, not a recent window — see
 *  governance-system.ts's header for why standing still shifts over time
 *  regardless (the trust ingredient below is the one that moves tick to
 *  tick). */
export const STANDING_CONTRIBUTION_NORMALIZER = 20;
export const STANDING_CONTRIBUTION_WEIGHT = 0.3;

/** Count of GIFT/HELP/TEACH verbs a member has directed at a FELLOW
 *  community member (not just anyone) at or above which the help ingredient
 *  saturates at 1.0. Also a lifetime tally (see above). */
export const STANDING_HELP_NORMALIZER = 5;
export const STANDING_HELP_WEIGHT = 0.2;

/** Trust ingredient — the average INCOMING trust (UNIT_TRUST_SCALE 0..1)
 *  every fellow member holds toward this one — is already on a 0..1 scale,
 *  so it needs no separate normalizer. The heaviest single weight
 *  deliberately (leadership must be able to shift as trust shifts, since
 *  the other three ingredients are lifetime-cumulative and rarely reverse). */
export const STANDING_TRUST_WEIGHT = 0.35;

/** Ticks-since-joining at or above which the tenure ingredient saturates at
 *  1.0. Approximated from a join-tick this system tracks itself (founders:
 *  the community's `formedTick`; later joiners: the governance pass on
 *  which they were first observed as a member — see
 *  governance-system.ts's `refreshJoinTicks`). */
export const STANDING_TENURE_NORMALIZER_TICKS = 500;
export const STANDING_TENURE_WEIGHT = 0.15;

// --- votable norms (sub-pass b) -----------------------------------------------

/** Every member's PREFERENCE for a norm value is a blend of `loyalty` and
 *  `(1 - greed)` (see governance-system.ts's `preferenceScalar`) mapped onto
 *  that norm's own [min, max] authoring range below — loyal/unselfish
 *  members prefer the HIGH end, greedy/individualist members the LOW end,
 *  per the brief. */
export const NORM_SHARE_RATE_MIN = 0.02;
export const NORM_SHARE_RATE_MAX = 0.6;
export const NORM_COOPERATION_EXPECTATION_MIN = 0.3;
export const NORM_COOPERATION_EXPECTATION_MAX = 0.9;
export const NORM_ADMISSION_POLICY_MIN = 0.1;
export const NORM_ADMISSION_POLICY_MAX = 0.9;

/** A vote's per-member weight is `STANDING_VOTE_WEIGHT_FLOOR + standing` —
 *  the floor guarantees even a zero-standing member still casts SOME vote
 *  (no one is fully disenfranchised), while higher standing still buys
 *  proportionally more influence. */
export const STANDING_VOTE_WEIGHT_FLOOR = 0.1;

/** The leader's vote counts this many TIMES as much as an equal-standing
 *  non-leader's — influence, not dictatorship: a leader with mediocre
 *  standing still only outweighs by this multiplier, and the underlying
 *  standing-weighted sum of every OTHER member can still out-vote them. */
export const LEADER_VOTE_WEIGHT_MULTIPLIER = 2;

/** Bounded per-pass step: a norm can move AT MOST this much toward the
 *  standing-weighted target in one governance pass, so norms visibly DRIFT
 *  over many passes rather than snapping straight to the vote's target. */
export const NORM_VOTE_STEP = 0.02;

/** Minimum |new - old| for a norm change to be considered meaningful enough
 *  to emit `ONT_GOVERNANCE.NORM_CHANGED` — the norm value itself still
 *  updates below this gate (drift never stalls), only the event is
 *  suppressed for a sub-noise-floor nudge. */
export const NORM_CHANGE_EMIT_EPSILON = 0.005;

// --- norm-clash -> defection (sub-pass d) -------------------------------------

/** A member's clash score is `|community.norms.shareRate - memberPreferredShareRate| /
 *  (NORM_SHARE_RATE_MAX - NORM_SHARE_RATE_MIN)` — a fraction of the
 *  authoring range. At or above this threshold, the member's genome
 *  "strongly clashes" with the community's actual norm (brief's phrase),
 *  triggering the trust/belonging erosion below. */
export const NORM_CLASH_THRESHOLD = 0.35;

/** Per governance pass a clashing member's OUTGOING trust toward EVERY
 *  fellow member is nudged down by this much — feeds the EXISTING
 *  COMMUNITY-stage LEAVE/SPLIT pass (this system never removes a member
 *  itself for a norm clash; see governance-system.ts's header). */
export const NORM_CLASH_TRUST_ERODE = 0.05;

/** Per governance pass a clashing member's `belonging` need is also nudged
 *  down directly by this much (on top of the trust erosion above) — a
 *  norm-clashing member feels the community doesn't fit them, not only that
 *  they trust it less. */
export const NORM_CLASH_BELONGING_ERODE = 4;

// --- sanctions (sub-pass c) ---------------------------------------------------

/** Violation-severity weights (see governance-system.ts's violation log) —
 *  deliberately ordered hoard < steal < sabotage < attack, mirroring the
 *  antagonistic verbs' own relative trust-hit severities
 *  (social/constants.ts's STEAL/SABOTAGE/ATTACK trust deltas). */
export const VIOLATION_SEVERITY_HOARD = 1;
export const VIOLATION_SEVERITY_STEAL = 1.5;
export const VIOLATION_SEVERITY_SABOTAGE = 2.5;
export const VIOLATION_SEVERITY_ATTACK = 4.5;

/** A member counts as "hoarding" this pass when they hold at least this
 *  many total goods (all kinds summed)... */
export const SANCTION_HOARD_MIN_GOODS = 10;
/** ...AND their lifetime contribution tally is below
 *  `totalGoods * community.norms.shareRate * SANCTION_HOARD_LENIENCY_FRACTION`
 *  — a fraction, not the full expected-contribution figure, so a member who
 *  has given SOME but not the full norm-implied share isn't sanctioned for
 *  merely under-shooting; this only catches members giving markedly less
 *  than the norm expects while visibly sitting on goods. */
export const SANCTION_HOARD_LENIENCY_FRACTION = 0.5;

/** Total accumulated violation severity at or above which the sanction is
 *  EXCLUSION rather than a fine/trust-penalty — a single ATTACK (severity
 *  4.5) alone clears this on its own ("severe"); several smaller violations
 *  (steal/sabotage/hoard) accumulate toward it across passes via the
 *  residual carry-over below ("repeated"). */
export const SANCTION_EXCLUSION_SEVERITY_THRESHOLD = 4;

/** After a non-exclusion (fined) sanction, the ANTISOCIAL portion of the
 *  violator's accumulated severity is multiplied by this fraction rather
 *  than zeroed — a fined member's violation history doesn't vanish
 *  outright, so a repeat offender crosses the exclusion threshold faster
 *  than a first-timer would. The HOARD ingredient is never carried over
 *  this way (it's recomputed live from current holdings every pass). */
export const SANCTION_RESIDUAL_FRACTION = 0.5;

/** Base fine fraction (of the violator's CURRENT holdings, each good
 *  transferred proportionally to the community stockpile) at severity 1,
 *  scaled up by `severityScale` (see governance-system.ts) and clamped to
 *  `SANCTION_FINE_MAX_FRACTION`. */
export const SANCTION_FINE_BASE_FRACTION = 0.15;
export const SANCTION_FINE_MAX_FRACTION = 0.75;

/** Base trust-penalty magnitude (UNIT_TRUST_SCALE 0..1) EVERY fellow
 *  member's trust toward the violator drops by at severity 1, scaled the
 *  same way as the fine fraction and clamped to
 *  `SANCTION_TRUST_PENALTY_MAX`. */
export const SANCTION_TRUST_PENALTY_BASE = 0.1;
export const SANCTION_TRUST_PENALTY_MAX = 0.5;

/** Divides accumulated severity into the `severityScale` multiplier the
 *  fine fraction and trust penalty both scale by (see above) — chosen so a
 *  single STEAL (1.5) yields a modest scale (~0.5x) while a single ATTACK
 *  (4.5, which actually triggers exclusion instead — see the threshold
 *  above) would have yielded a much harsher one had it not. */
export const SANCTION_SEVERITY_NORMALIZER = 3;
/** Upper clamp on `severity / SANCTION_SEVERITY_NORMALIZER` before the
 *  leader-stance/cooperation-expectation multipliers apply. */
export const SANCTION_SEVERITY_SCALE_CAP = 2;
