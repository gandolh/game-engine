export interface RecapStanding {
  rank: number;
  name: string;
  personality: string;
  totalValue: number;
  gold: number;

  midRankDelta: number;
}

export interface RunRecap {
  standings: RecapStanding[];
  arcs: string[];
  headline: string;

  rivalries?: string[];
}
