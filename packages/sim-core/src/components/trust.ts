export interface SpriteAnim {
  clip: string;
  frame: number;
  elapsedMs: number;
  playing: boolean;
}

export interface TrustScores {
  byId: Map<number, number>;
}

/** Ring buffer of the most recent deliberation reasons; surfaced in the observer panel. */
export interface DecisionTrace {
  reasons: string[];
}

export const DECISION_TRACE_CAP = 3;
