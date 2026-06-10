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

/** Relationship matrix panel data. trust[fromId][toId] ∈ [0,1]; missing = 0.5 baseline. */
export interface RelationshipMatrixData {
  farmers: Array<{ id: number; name: string; personality: string }>;
  trust: Record<number, Record<number, number>>;
}
