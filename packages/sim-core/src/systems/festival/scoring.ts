

import type { CropQuality } from "../../components";

export interface Submission {
  id: number;
  name: string;
  bestQuality: CropQuality;
  bestRank: number;
  bestCount: number;
}

export const QUALITY_RANK: Record<CropQuality, number> = { normal: 1, silver: 2, gold: 3 };

export function rankSubmissions(entries: readonly Submission[]): Submission[] {
  return [...entries].sort((a, b) => {
    if (a.bestRank !== b.bestRank) return b.bestRank - a.bestRank;
    if (a.bestCount !== b.bestCount) return b.bestCount - a.bestCount;
    return a.id - b.id;
  });
}
