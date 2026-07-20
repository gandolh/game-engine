/**
 * Feud tunables (chunk hollow-12b) — every dial `feud-system.ts`'s
 * `HollowFeudSystem` (escalation/decay/reconciliation) pulls from, collected
 * in ONE documented block per social/constants.ts's and
 * governance/constants.ts's "one derivation, not separately-guessed
 * numbers" convention.
 *
 * ── the scale ──────────────────────────────────────────────────────────────
 * `FEUD_MAX` = 1, mirroring `UNIT_TRUST_SCALE`'s own upper bound (engine
 * agent/relationship.ts) so a grudge and a trust score are directly
 * comparable in magnitude even though they're separate ledgers
 * (components/feud.ts's header explains why they're kept separate at all).
 *
 * ── escalation (harm -> grudge up) ────────────────────────────────────────
 * `FEUD_INCREMENT_*` are ordered ATTACK > SABOTAGE > STEAL > RUMOR, mirroring
 * governance/constants.ts's own `VIOLATION_SEVERITY_*` ordering — the
 * harsher the harm, the more grudge a single instance seeds. Picked so a
 * single ATTACK or SABOTAGE alone clears `FEUD_START_THRESHOLD` in one shot
 * ("one betrayal is enough to start a feud" for the severe verbs), while a
 * single STEAL or RUMOR needs a SECOND instance (steal) or several (rumor)
 * before the grudge itself becomes "active" — cheap antagonism doesn't
 * instantly curdle a relationship into a standing feud, repeated harm does.
 * `HollowFeudSystem` only accrues these on the DETECTED branch of steal/
 * sabotage (an undetected theft the victim never learns happened, mirroring
 * why `STEAL_DETECTED`/`SABOTAGE`'s own trust hits are detection-gated too —
 * see social/constants.ts) — attack and rumor have no detection gate (the
 * victim always knows they were attacked; a rumor's target is assumed, per
 * the brief, to eventually learn who spread it).
 */
export const FEUD_MAX = 1;

export const FEUD_INCREMENT_ATTACK = 0.5;
export const FEUD_INCREMENT_SABOTAGE = 0.3;
export const FEUD_INCREMENT_STEAL = 0.2;
export const FEUD_INCREMENT_RUMOR = 0.1;

/**
 * ── reconciliation (grudge -> down) ───────────────────────────────────────
 * Passive decay is a FLAT per-tick subtraction (not a fractional
 * closes-the-gap rate like `TRUST_DECAY_TOWARD_NEUTRAL_RATE`) — a grudge has
 * no "neutral" floor to approach asymptotically (components/feud.ts's
 * header), so a flat countdown is both simpler and easier to reason about:
 * a grudge that just crossed `FEUD_START_THRESHOLD` (0.25) with nothing
 * further happening decays back to 0 in exactly
 * `FEUD_START_THRESHOLD / FEUD_DECAY_PER_TICK` = 125 ticks — comfortably
 * observable within this brief's "a few hundred ticks" test budget, without
 * being so fast that an escalation from a single detected steal (0.2, just
 * under the start threshold) evaporates before a second incident can ever
 * compound it.
 */
export const FEUD_DECAY_PER_TICK = 0.002;

/** A genuine cooperative gesture (GIFT/HELP/TEACH toward the grudge-holder,
 *  or either side of an ACCEPTED TRADE) from the resented peer is a SHARP
 *  drop — comparable in magnitude to `STEAL_DETECTED_TRUST_DELTA`/
 *  `SABOTAGE_DETECTED_TRUST_DELTA` (both 0.3, social/constants.ts) — not a
 *  gradual fade: "repeated cooperation after a betrayal can rebuild trust"
 *  (the brief) reads as each cooperative act meaningfully undoing a chunk of
 *  the grudge, not an imperceptible nudge. Applied only when a grudge > 0
 *  already exists toward that peer (feud-system.ts) — a cooperative act
 *  toward someone the actor never resented has nothing to reconcile. */
export const FEUD_RECONCILE_REDUCTION = 0.3;

/**
 * ── thresholds (hysteresis band) ──────────────────────────────────────────
 * `FEUD_START_THRESHOLD` (0.25) sits BELOW a single ATTACK/SABOTAGE
 * increment (so one severe harm alone starts a feud) but ABOVE a single
 * STEAL/RUMOR increment (so the cheaper verbs need repetition — see
 * escalation header). `FEUD_RECONCILE_THRESHOLD` (0.1) is deliberately LOWER
 * than the start threshold, not the same value — a Schmitt-trigger-style
 * hysteresis band so a grudge oscillating right at one boundary (e.g. decay
 * nudging it from 0.24 to 0.26 and back) can't flicker STARTED/RECONCILED
 * every tick; the grudge must fall meaningfully further than where it
 * started before the arc is considered genuinely closed.
 */
export const FEUD_START_THRESHOLD = 0.25;
export const FEUD_RECONCILE_THRESHOLD = 0.1;

/**
 * ── deliberation amplification (agents/social-verbs.ts) ───────────────────
 * A single bounded weight, reused for BOTH nudging antagonistic-verb TARGET
 * SELECTION toward a peer the actor already holds a grudge against, and as
 * an additive bonus added ON TOP of (not folded into) that verb's normal
 * weighted-average score. Deliberately modest: at `FEUD_MAX` grudge (1.0),
 * the bonus is only `FEUD_DELIBERATION_WEIGHT` = 0.15 — enough to push an
 * already-borderline score (e.g. ~0.5) over `SOCIAL_ACTION_MIN_SCORE` (0.6),
 * but nowhere near enough to make a low, unremarkable score (e.g. ~0.2)
 * clear the gate on grudge alone. This is what keeps escalation a NUDGE
 * (a grudge-holder is measurably more likely to keep targeting the same
 * peer, and more likely to tip into acting at all) rather than a hard
 * override that would turn every grudge into a guaranteed retaliation
 * (the brief's explicit "does NOT turn every agent into a berserker").
 * Not threaded through `HollowSimOptions` — mirrors how NO other
 * deliberation-constants.ts dial is either (only the ACT-stage verb-EFFECT
 * systems' probability knobs are exposed there, per that file's own
 * override-pattern comment in sim-bootstrap.ts).
 */
export const FEUD_DELIBERATION_WEIGHT = 0.15;
