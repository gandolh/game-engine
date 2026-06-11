export interface RecapStanding {
  rank: number;
  name: string;
  personality: string;
  totalValue: number;
  gold: number;
  /** Change vs. mid-season (day 50) rank. Positive = improved; negative = fell; 0 = unchanged. */
  midRankDelta: number;
}

/** All fields are structured-clone-friendly for postMessage transfer. */
export interface RunRecap {
  standings: RecapStanding[];
  arcs: string[];
  headline: string;
  /** Absent when no active rivalries. */
  rivalries?: string[];
}
