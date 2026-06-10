// ui-types.ts — pure data interfaces for the UI panels, owned by the snapshot
// layer because they are part of the RenderSnapshot contract (the server
// produces them; the renderer's DOM panels consume them).
//
// These were originally co-located with their DOM panel classes in
// farm-valley/src/ui/{observer,leaderboard,relationship-matrix}. The panels now
// import the types FROM HERE (down into sim-core), keeping sim-core free of any
// DOM dependency while the renderer keeps the rendering code.

/** One leaderboard row (rank + the farmer's wealth breakdown). */
export interface LeaderboardRow {
  rank: number;
  id: number;
  name: string;
  personality: string;
  gold: number;
  unsoldValue: number;
  totalValue: number;
}

/**
 * Data for the relationship matrix panel. Structured-clone-friendly (no Maps).
 * `trust` maps `fromId` → `toId` → trust value (baseline 0.5 for unseen peers).
 */
export interface RelationshipMatrixData {
  /** Farmers in deterministic order (sorted by id asc). */
  farmers: Array<{ id: number; name: string; personality: string }>;
  /**
   * Trust matrix: trust[fromId][toId] = value in [0,1].
   * Missing entries fall back to 0.5 (baseline).
   */
  trust: Record<number, Record<number, number>>;
}
