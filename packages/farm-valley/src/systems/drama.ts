/**
 * drama.ts — pure, centralized drama-scoring module for Farm Valley.
 *
 * Rank source: RunHistorySystem (brief 36, now merged). EventFeedSystem injects
 * a RunHistorySystem instance and reads `.history()` once per new day to detect
 * rank-1 changes. Drama scoring itself is pure (no world access).
 *
 * Act bands (establishment / competition / climax) are defined as fractions of
 * maxDays rather than hard-coded day numbers, so the scoring generalises beyond
 * 100-day runs. At maxDays=100 they map to days 1–30 / 31–70 / 71–100.
 *
 * Determinism: dramaScore is a pure function of (kind, ctx). No Date.now,
 * no Math.random. Same inputs → byte-identical output.
 */

// ---------------------------------------------------------------------------
// Event kind union
// ---------------------------------------------------------------------------

/**
 * Exhaustive union of event kinds EventFeedSystem captures.
 * Matches the capture sites in event-feed.ts:
 *   "trade"      → captureTrade  (TRADE_COMPLETED)
 *   "auction"    → captureAuction (AUCTION_RESULT)
 *   "shock"      → captureShock  (SHOCK / blight)
 *   "crop-death" → captureCropDeath (CROP_DEATH)
 *   "accept"     → snoopFarmerInboxes (encounter ACCEPT — peer seed deals)
 *   "rivalry"    → snoopRivalrySystem ("rivalry" kind from RivalrySystem)
 *   "alliance"   → snoopRivalrySystem ("alliance" kind from RivalrySystem)
 *   "rank-flip"  → rank-change detection (NEW: X overtakes Y for 1st!)
 *   "race-on"    → final-stretch proximity line (NEW)
 *   "festival"   → festival harvest-contest result (brief 45)
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
  | "festival";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface DramaCtx {
  /** Current sim day (1-based). */
  day: number;
  /** Total number of sim days (from DayClockSystem.config.maxDays). */
  maxDays: number;
}

// ---------------------------------------------------------------------------
// Act bands
// ---------------------------------------------------------------------------

export type ActBand = "establishment" | "competition" | "climax";

/**
 * Returns the act band for a given day within a maxDays run.
 *
 * Bands are defined as fractions of maxDays:
 *   establishment = first 30%  (days 1–30 at maxDays=100)
 *   competition   = next  40%  (days 31–70 at maxDays=100)
 *   climax        = last  30%  (days 71–100 at maxDays=100)
 *
 * Pure, deterministic; exported so tests can exercise it directly.
 */
export function actBandForDay(day: number, maxDays: number): ActBand {
  // Guard: treat degenerate inputs as climax (nothing to lose).
  if (maxDays <= 0) return "climax";
  const frac = day / maxDays;
  if (frac <= 0.3) return "establishment";
  if (frac <= 0.7) return "competition";
  return "climax";
}

// ---------------------------------------------------------------------------
// Base drama table
// ---------------------------------------------------------------------------

/**
 * Base drama score per event kind, before the act-band multiplier is applied.
 * Values are on [0, 1].
 *
 * Rationale:
 *   trade      — routine crop exchange; economically minor in isolation.
 *   auction    — golden-bean auction wins are economically significant.
 *   shock      — blight is the biggest single disruptive event in the run.
 *   crop-death — painful but more frequent than a blight; slightly lower.
 *   accept     — peer seed deal; minor in practice (peer layer is mostly inert).
 *   rivalry    — relationship events; notable but not directly economic.
 *   alliance   — same tier as rivalry.
 *   rank-flip  — a standings reversal at the top is the most dramatic routine
 *                event; base is high even before the act multiplier.
 *   race-on    — final-stretch proximity framing; high by construction.
 */
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
  // festival — a scheduled calendar landmark with a gold prize + standing bump;
  // a deliberate spotlight beat (and a chance for a trailing farmer to win one).
  "festival":   0.70,
};

// ---------------------------------------------------------------------------
// Act-band multipliers
// ---------------------------------------------------------------------------

/**
 * Multipliers applied to the base score per act band.
 *
 * Establishment events are quieter; climax events are louder. The multiplier
 * is applied before clamping so even a small base score gets a proportional
 * boost in the climax act.
 *
 * establishment: 0.80 — dial down early noise.
 * competition:   1.00 — neutral (reference level).
 * climax:        1.20 — boost late-game stakes.
 */
const ACT_MULTIPLIER: Record<ActBand, number> = {
  "establishment": 0.80,
  "competition":   1.00,
  "climax":        1.20,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the drama score for an event of `kind` in `ctx`.
 *
 * Pure: no side effects, no randomness, no Date.now. Deterministic.
 * Returns a value in [0, 1].
 */
export function dramaScore(kind: DramaEventKind, ctx: DramaCtx): number {
  const base = BASE_DRAMA[kind];
  const band = actBandForDay(ctx.day, ctx.maxDays);
  const multiplier = ACT_MULTIPLIER[band];
  return Math.min(1, Math.max(0, base * multiplier));
}
