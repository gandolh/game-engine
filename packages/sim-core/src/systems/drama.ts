/**
 * Pure drama-scoring module. dramaScore is a pure function of (kind, ctx) —
 * no Date.now, no Math.random. Act bands are fractions of maxDays (1–30/31–70/71–100 at 100 days).
 */

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
  /** Current sim day (1-based). */
  day: number;
  /** Total number of sim days (from DayClockSystem.config.maxDays). */
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

/** Base drama [0,1] per kind before act-band multiplier. rank-flip/race-on are high by design. */
const BASE_DRAMA: Record<DramaEventKind, number> = {
  "trade":      0.10,
  "auction":    0.55,
  "shock":      0.85,
  "crop-death": 0.40,
  "accept":     0.15,
  "rivalry":    0.45,
  "alliance":   0.40,
  "rank-flip":  0.75,
  "race-on":    0.90,
  "festival":   0.70,
  "contract-delivered": 0.60,
  "contract-missed":    0.55,
  "coral-catch":        0.50,
};

/** establishment: 0.80 (quiet early), competition: 1.00 (reference), climax: 1.20 (louder late). */
const ACT_MULTIPLIER: Record<ActBand, number> = {
  "establishment": 0.80,
  "competition":   1.00,
  "climax":        1.20,
};

export function dramaScore(kind: DramaEventKind, ctx: DramaCtx): number {
  const base = BASE_DRAMA[kind];
  const band = actBandForDay(ctx.day, ctx.maxDays);
  const multiplier = ACT_MULTIPLIER[band];
  return Math.min(1, Math.max(0, base * multiplier));
}
