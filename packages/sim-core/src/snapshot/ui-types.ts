
export interface LeaderboardRow {
  rank: number;
  id: number;
  name: string;
  personality: string;
  gold: number;
  unsoldValue: number;
  totalValue: number;
}

export interface RelationshipMatrixData {
  farmers: Array<{ id: number; name: string; personality: string }>;
  trust: Record<number, Record<number, number>>;
}
