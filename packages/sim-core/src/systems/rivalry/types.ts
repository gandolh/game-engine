/** Adverse-event accumulator threshold for labeling a named rivalry. 3 → ~2–5 rivalries on a typical 100-day run. */
export const RIVALRY_THRESHOLD = 3;
/** Mutual trust ceiling for an alliance label; baseline 0.5, high-cooperation pairs reach 0.8+. */
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
