/**
 * Rivalry system constants, types, and helpers.
 * Split from rivalry.ts.
 */

// ---- thresholds -----------------------------------------------------------

/**
 * Number of adverse events an ordered pair must accumulate before being labeled
 * a rivalry. Tuned so a handful (2–6) fire per 100-day run on a typical seed.
 *
 * Adverse events per run estimate:
 *   - DECLINE: farmers send ~1-3 OFFER_SEED encounters/day; a fraction decline.
 *     Across 100 days × 4 pairs, there could be 10-40 total declines spread
 *     across 6 possible pairs → ~2-7 per pair. Threshold 3 puts most pairs just
 *     under or over the line — a handful fire.
 *   - Broken CNP commitments: rare (~0-2 total per run).
 * Threshold = 3 produces ~2-5 named rivalries on seed 0xc0ffee (observed).
 */
export const RIVALRY_THRESHOLD = 3;

/**
 * Both farmers in a pair must have mutual trust ≥ this value for the pair to be
 * labeled an alliance. Trust baseline is 0.5; high-cooperation pairs climb toward
 * 0.8+ after several ACCEPTs + successful trades.
 */
export const ALLIANCE_TRUST_THRESHOLD = 0.8;

// ---- types ----------------------------------------------------------------

/** An active named rivalry between two farmers. */
export interface ActiveRivalry {
  /** Lower farmer id (ordered). */
  aId: number;
  /** Higher farmer id (ordered). */
  bId: number;
  /** Accumulated adverse-event score. */
  score: number;
}

/** An active named alliance between two farmers. */
export interface ActiveAlliance {
  aId: number;
  bId: number;
}

/** A just-formed rivalry (cleared after EventFeedSystem reads it). */
export interface FreshRivalry {
  aId: number;
  bId: number;
  score: number;
  kind: "rivalry" | "alliance";
}

// ---- helpers ---------------------------------------------------------------

export function pairKey(a: number, b: number): string {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return `${lo}:${hi}`;
}
