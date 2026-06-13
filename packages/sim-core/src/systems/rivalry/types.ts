// Unified relationship axis: rivalry/friendship/alliance are all DERIVED from the
// directional `trust` map (range [0,1], baseline 0.5 = strangers). The old
// monotonic adverse-event accumulator is gone — `trust` IS the axis.
//
// Bands (see corpus/todos/2026-06-12-00-foundation-relationship-axis.md):
//   rival   : my trust toward you  < RIVAL_CUTOFF   (ONE-SIDED / directional)
//   neutral : [RIVAL_CUTOFF, FRIEND_THRESHOLD)
//   friend  : mutual >= FRIEND_THRESHOLD
//   alliance: mutual >= ALLIANCE_TRUST_THRESHOLD
//
// Hysteresis: a fresh rivalry fires when a directed pair first drops below
// RIVAL_CUTOFF; it only RE-ARMS (can fire fresh again) after trust climbs back
// above RIVAL_REARM. Prevents feed spam from trust oscillating around the cutoff.

/** Directional rival cutoff. My trust toward you below this → I treat you as a rival. */
export const RIVAL_CUTOFF = 0.25;
/** Re-arm mark: a latched rivalry only re-fires fresh after trust recovers above this (> RIVAL_CUTOFF). */
export const RIVAL_REARM = 0.4;
/** Mutual trust floor for a friendship label. */
export const FRIEND_THRESHOLD = 0.75;
/** Mutual trust ceiling for an alliance label; baseline 0.5, high-cooperation pairs reach 0.8+. */
export const ALLIANCE_TRUST_THRESHOLD = 0.8;

/**
 * An active rivalry is DIRECTIONAL: `aId` holds the low trust toward `bId`.
 * `score` carries the current trust value (kept for the snapshot type; not an accumulator).
 */
export interface ActiveRivalry {
  aId: number;
  bId: number;
  score: number;
}

export interface ActiveAlliance {
  aId: number;
  bId: number;
}

/**
 * A relationship that crossed a labeling boundary this tick.
 * - rivalry: directional — `aId`'s trust toward `bId` just dropped below RIVAL_CUTOFF.
 * - alliance: undirected — `aId`/`bId` ordered lo/hi.
 */
export interface FreshRivalry {
  aId: number;
  bId: number;
  score: number;
  kind: "rivalry" | "alliance";
}

/** Ordered (undirected) key for symmetric pairs (alliances). */
export function pairKey(a: number, b: number): string {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return `${lo}:${hi}`;
}

/** Directed key for one-sided rivalries: `from` holds the low trust toward `to`. */
export function directedKey(from: number, to: number): string {
  return `${from}->${to}`;
}
