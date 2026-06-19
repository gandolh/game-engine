

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

export function pairKey(a: number, b: number): string {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return `${lo}:${hi}`;
}

export function directedKey(from: number, to: number): string {
  return `${from}->${to}`;
}
