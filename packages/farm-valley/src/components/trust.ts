export interface SpriteAnim {
  clip: string;
  frame: number;
  elapsedMs: number;
  playing: boolean;
}

export interface TrustScores {
  byId: Map<number, number>;
}

/**
 * Decision rationale trace (brief 19) — a tiny ring buffer of the most recent
 * one-line reasons a personality produced while deliberating. Game-side only
 * (the engine `Intentions` component is off-limits). Surfaced for the focused
 * farmer in the observer panel. Reasons are pure functions of the farmer's
 * beliefs/desires/inventory at decision time (no wall-clock, no random).
 */
export interface DecisionTrace {
  reasons: string[];
}

/** Max reasons kept in the decisionTrace ring buffer. */
export const DECISION_TRACE_CAP = 3;
