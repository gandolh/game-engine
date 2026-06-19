export interface TrustScores {
  byId: Map<number, number>;
}

export interface DecisionTrace {
  reasons: string[];
}

export const DECISION_TRACE_CAP = 3;
