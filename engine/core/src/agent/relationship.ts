/**
 * Relationship primitives — a pairwise directed ledger (agent → peerId → score)
 * plus the clamp-update rule, so any game can carry a "how does A feel about B"
 * scalar per ordered pair and nudge it by deltas on events.
 *
 * The ledger is intentionally minimal (a Map keyed by peer entity id). Games
 * decide what the scalar means and what thresholds matter; the engine only owns
 * the storage shape, the clamped update, and the canonical pair/directed keys
 * used to dedupe or latch relationship state.
 */

/** Directed relationship ledger owned by one agent: peer id → score. */
export interface RelationshipLedger {
  byId: Map<number, number>;
}

/** The numeric range a relationship score lives in, plus its default. */
export interface RelationshipScale {
  min: number;
  max: number;
  /** Value assumed for a peer with no recorded score yet. */
  neutral: number;
}

/** 0..1 with a neutral midpoint of 0.5 — a common trust convention. */
export const UNIT_TRUST_SCALE: RelationshipScale = { min: 0, max: 1, neutral: 0.5 };

/** Read a peer's score, falling back to the scale's neutral value. */
export function relationshipScore(
  ledger: RelationshipLedger | undefined,
  peerId: number,
  scale: RelationshipScale = UNIT_TRUST_SCALE,
): number {
  return ledger?.byId.get(peerId) ?? scale.neutral;
}

/** Nudge a peer's score by `delta`, clamped to the scale. Mutates the ledger. */
export function applyRelationshipDelta(
  ledger: RelationshipLedger,
  peerId: number,
  delta: number,
  scale: RelationshipScale = UNIT_TRUST_SCALE,
): void {
  const current = ledger.byId.get(peerId) ?? scale.neutral;
  const next = Math.max(scale.min, Math.min(scale.max, current + delta));
  ledger.byId.set(peerId, next);
}

/** Order-independent key for an unordered pair (a alliance is symmetric). */
export function pairKey(a: number, b: number): string {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return `${lo}:${hi}`;
}

/** Order-dependent key for a directed relation (a rivalry can be one-sided). */
export function directedKey(from: number, to: number): string {
  return `${from}->${to}`;
}
