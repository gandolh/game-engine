/** Per-farmer recap entry in the standings section. */
export interface RecapStanding {
  rank: number;
  name: string;
  personality: string;
  totalValue: number;
  gold: number;
  /**
   * Change vs. the mid-season (day 50) rank.
   * Positive = improved (e.g. was rank 3 at mid, now rank 1 → midRankDelta = +2).
   * Negative = fell. 0 = unchanged.
   */
  midRankDelta: number;
}

/**
 * The full end-of-run recap. All fields are plain, structured-clone-friendly
 * values suitable for cross-thread postMessage transfer.
 */
export interface RunRecap {
  /** Final standings with mid-season rank delta. */
  standings: RecapStanding[];
  /** One terse arc sentence per farmer (same order as standings = final rank). */
  arcs: string[];
  /** Single dramatic headline for the run. */
  headline: string;
  /**
   * Rivalry outcomes — gated on brief 37 (not yet merged).
   * Field is absent until brief 37 is implemented.
   * @see corpus/briefs/game/todo/37-*
   */
  rivalries?: string[];
}
