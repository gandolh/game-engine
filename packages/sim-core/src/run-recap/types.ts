/** Per-farmer recap entry in the standings section. */
export interface RecapStanding {
  rank: number;
  name: string;
  personality: string;
  totalValue: number;
  gold: number;
  /** Change vs. mid-season (day 50) rank. Positive = improved; negative = fell; 0 = unchanged. */
  midRankDelta: number;
}

/** End-of-run recap. All fields are structured-clone-friendly for postMessage transfer. */
export interface RunRecap {
  /** Final standings with mid-season rank delta. */
  standings: RecapStanding[];
  /** One terse arc sentence per farmer (same order as standings = final rank). */
  arcs: string[];
  /** Single dramatic headline for the run. */
  headline: string;
  /** Rivalry outcomes. Absent when no active rivalries. */
  rivalries?: string[];
}
