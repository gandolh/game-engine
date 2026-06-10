import type { FishKind } from "../components";

/**
 * brief 48 — coral fishing protocol. A notable coral catch (the rare lobster)
 * is broadcast so EventFeedSystem can narrate it (single market-wall surface,
 * exactly like AUCTION_RESULT). Routine coral-trout catches are NOT broadcast
 * (they'd flood the feed) — only the jackpot lobster.
 */
export const ONT_CORAL = {
  CAUGHT: "coral-caught",
} as const;

export type CoralOntology = (typeof ONT_CORAL)[keyof typeof ONT_CORAL];

export interface CoralCaughtBody {
  farmerId: number;
  farmerName: string;
  fish: FishKind;
  reefId: string;
  /** Gold value of the catch (for the feed line). */
  value: number;
}
