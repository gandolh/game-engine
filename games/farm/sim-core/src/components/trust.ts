import type { RelationshipLedger } from "@engine/core/agent";

/**
 * Farm's trust ledger is the engine's generic relationship ledger (peer id →
 * 0..1 trust, neutral 0.5). Kept as a named alias so game code reads `TrustScores`.
 */
export type TrustScores = RelationshipLedger;

export interface DecisionTrace {
  reasons: string[];
}

export const DECISION_TRACE_CAP = 3;
