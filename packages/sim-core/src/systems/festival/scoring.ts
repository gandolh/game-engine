/**
 * Festival scoring helpers and types.
 * Split from festival.ts.
 */

import type { CropQuality } from "../../components";

/** A captured contest entry: the best contest-crop unit a farmer held that day. */
export interface Submission {
  id: number;
  name: string;
  bestQuality: CropQuality;
  bestRank: number;
  bestCount: number;
}

export const QUALITY_RANK: Record<CropQuality, number> = { normal: 1, silver: 2, gold: 3 };

/**
 * Pure, deterministic contest ranking — the heart of the harvest contest, split
 * out so it can be unit-tested without a live sim. Ranks entrants by best crop
 * quality (gold > silver > normal), breaking ties by MORE units of that quality,
 * then by lower farmer id (ids are unique, so this is a total order). Returns a
 * sorted copy; the winner is element 0 (or null if there are no entrants).
 */
export function rankSubmissions(entries: readonly Submission[]): Submission[] {
  return [...entries].sort((a, b) => {
    if (a.bestRank !== b.bestRank) return b.bestRank - a.bestRank;
    if (a.bestCount !== b.bestCount) return b.bestCount - a.bestCount;
    return a.id - b.id;
  });
}
