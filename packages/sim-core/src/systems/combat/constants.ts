// Combat tuning constants. All numbers are DEFAULTS — the brief mandates measuring
// fights/day + AP-spent in a real run and tuning; that calibration is deferred (see
// corpus/todos/2026-06-13-tune-combat-frequency.md). Nothing here is wall-clock; the
// swing cadence is derived from ticksPerDay so a bout spans a visible window at the
// browser pace (~1200 ticks/day) and still resolves quickly headless (~20/day).

/** Per-swing damage range for bare fists (inclusive lo, exclusive hi via rng.nextInt). */
export const FIST_DAMAGE = { lo: 4, hi: 9 } as const;
/** Per-swing damage range for the bat — strictly stronger than fists. */
export const BAT_DAMAGE = { lo: 8, hi: 15 } as const;

/** AP a swing costs. Bat hits harder but burns more AP, so it drains the budget faster. */
export const AP_PER_SWING = { fist: 2, bat: 3 } as const;

/**
 * Swing cadence: one swing-exchange every N ticks, N scaled to ticksPerDay so the
 * bout always spans a visible wall-clock window. At 1200/day → ~24 ticks between
 * swings (a bout of ~6–10 swings reads over a few seconds); at 20/day → 1 tick
 * (resolves immediately, headless). Pure function of ticksPerDay (determinism-safe).
 */
export function swingIntervalTicks(ticksPerDay: number): number {
  return Math.max(1, Math.round(ticksPerDay / 50));
}

/** Ring stake: gold transferred loser → winner. */
export const RING_STAKE_GOLD = 10;

/** Trust nudged UP (both directions) after a sanctioned ring bout — de-escalation. */
export const RING_TRUST_BOND = 0.1;

/** Trust a witness loses toward the initiator for merely seeing a street attack. */
export const STREET_ATTACK_TRUST_PENALTY = -0.08;
/** Extra trust loss (on top of the attack penalty) when the initiator also LOOTS. */
export const STREET_LOOT_TRUST_PENALTY = -0.12;

/** Max individual goods units a victor may loot from a KO'd target (tools/gold excluded). */
export const MAX_LOOT_UNITS = 3;

/** A settled fight keeps a pair from re-fighting for this many in-game days. */
export const FIGHT_COOLDOWN_DAYS = 2;
/** Max fights a single farmer may initiate per day. */
export const DAILY_FIGHT_CAP = 2;

/** Pursuit window for a street chase, tuned to ~10s at viewing pace. Tick-based, not wall-clock. */
export function pursuitWindowTicks(ticksPerDay: number): number {
  return Math.max(2, Math.round(ticksPerDay / 2));
}

/** Per-tick seeded flee chance during a STREET brawl (either fighter may bail; no KO, no loot). */
export const STREET_FLEE_CHANCE = 0.04;
