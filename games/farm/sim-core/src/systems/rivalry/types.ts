// Canonical pair/directed keys are the engine's relationship primitives.
export { pairKey, directedKey } from "@engine/core/agent";

export const RIVAL_CUTOFF = 0.25;

export const RIVAL_REARM = 0.4;

export const FRIEND_THRESHOLD = 0.75;

export const ALLIANCE_TRUST_THRESHOLD = 0.8;

export interface ActiveRivalry {
  aId: number;
  bId: number;
  score: number;
}

export interface ActiveAlliance {
  aId: number;
  bId: number;
}

export interface FreshRivalry {
  aId: number;
  bId: number;
  score: number;
  kind: "rivalry" | "alliance";
}
