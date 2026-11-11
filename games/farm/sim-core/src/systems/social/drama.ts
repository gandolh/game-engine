export type DramaEventKind =
  | "trade"
  | "auction"
  | "shock"
  | "crop-death"
  | "accept"
  | "rivalry"
  | "alliance"
  | "rank-flip"
  | "race-on"
  | "festival"
  | "contract-delivered"
  | "contract-missed"
  | "coral-catch";

export interface DramaCtx {
  day: number;

  maxDays: number;
}

export type ActBand = "establishment" | "competition" | "climax";

export function actBandForDay(day: number, maxDays: number): ActBand {
  if (maxDays <= 0) return "climax";
  const frac = day / maxDays;
  if (frac <= 0.3) return "establishment";
  if (frac <= 0.7) return "competition";
  return "climax";
}

const BASE_DRAMA: Record<DramaEventKind, number> = {
  trade: 0.1,
  auction: 0.55,
  shock: 0.85,
  "crop-death": 0.4,
  accept: 0.15,
  rivalry: 0.45,
  alliance: 0.4,
  "rank-flip": 0.75,
  "race-on": 0.9,
  festival: 0.7,
  "contract-delivered": 0.6,
  "contract-missed": 0.55,
  "coral-catch": 0.5,
};

const ACT_MULTIPLIER: Record<ActBand, number> = {
  establishment: 0.8,
  competition: 1.0,
  climax: 1.2,
};

export function dramaScore(kind: DramaEventKind, ctx: DramaCtx): number {
  const base = BASE_DRAMA[kind];
  const band = actBandForDay(ctx.day, ctx.maxDays);
  const multiplier = ACT_MULTIPLIER[band];
  return Math.min(1, Math.max(0, base * multiplier));
}
