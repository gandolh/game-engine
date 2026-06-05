/**
 * run-recap.ts — pure synthesis module for the end-of-run "Legends" recap.
 *
 * All exports are pure functions of their inputs: no side effects, no
 * Date.now / Math.random. Same inputs → byte-identical RunRecap.
 *
 * Imported by snapshot-builder at game-over to embed the recap in the
 * RenderSnapshot, and by run-recap.test.ts for unit tests.
 */

import type { RunHistoryRow } from "./systems/run-history";
import type { EventEntry } from "./systems/event-feed";
import type { FinalStandingRow, SnapshotRivalry } from "./worker/snapshot";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Per-farmer recap entry in the standings section. */
export interface RecapStanding {
  rank: number;
  name: string;
  personality: string;
  totalValue: number;
  gold: number;
  /**
   * Change vs. the mid-season (day 50) rank.
   * Positive = improved (e.g. was rank 3 at mid, now rank 1 → midRankDelta = +2).
   * Negative = fell. 0 = unchanged.
   */
  midRankDelta: number;
}

/**
 * The full end-of-run recap. All fields are plain, structured-clone-friendly
 * values suitable for cross-thread postMessage transfer.
 */
export interface RunRecap {
  /** Final standings with mid-season rank delta. */
  standings: RecapStanding[];
  /** One terse arc sentence per farmer (same order as standings = final rank). */
  arcs: string[];
  /** Single dramatic headline for the run. */
  headline: string;
  /**
   * Rivalry outcomes — gated on brief 37 (not yet merged).
   * Field is absent until brief 37 is implemented.
   * @see corpus/briefs/game/todo/37-*
   */
  rivalries?: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the max day in the history and return floor(maxDay / 2) as the
 * midpoint. Returns 0 if history is empty.
 */
function midpointDay(history: readonly RunHistoryRow[]): number {
  if (history.length === 0) return 0;
  let maxDay = 0;
  for (const row of history) {
    if (row.day > maxDay) maxDay = row.day;
  }
  return Math.floor(maxDay / 2);
}

/**
 * Build a map { day → { farmerId → rank } } from the full history.
 * Deterministic: history rows processed in insertion order.
 */
function buildRankMap(
  history: readonly RunHistoryRow[],
): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>();
  for (const row of history) {
    let dayMap = out.get(row.day);
    if (dayMap === undefined) {
      dayMap = new Map<number, number>();
      out.set(row.day, dayMap);
    }
    dayMap.set(row.farmerId, row.rank);
  }
  return out;
}

/** Ordinal suffix for a rank number (1 → "st", 2 → "nd", 3 → "rd", N → "th"). */
function rankSuffix(rank: number): string {
  if (rank === 1) return "st";
  if (rank === 2) return "nd";
  if (rank === 3) return "rd";
  return "th";
}

/** Short trajectory label from sorted rank rows. */
function describeTrajectory(rows: readonly RunHistoryRow[]): string {
  if (rows.length < 2) return "brief";
  const first = rows[0]!.rank;
  const last = rows[rows.length - 1]!.rank;
  if (last < first) return "rising";
  if (last > first) return "declining";
  return "consistent";
}

// ---------------------------------------------------------------------------
// Arc generation
// ---------------------------------------------------------------------------

/**
 * Derive a terse one-line arc sentence for a single farmer.
 *
 * Three named patterns (from the brief):
 *   "surge"    — spent ≥ 50% of days at last place, ended 1st.
 *   "collapse" — led (1st) for ≥ 50% of days, ended at rank ≥ 3.
 *   "steady"   — in the top half for ≥ 75% of days (neither surge nor collapse).
 *   fallback   — generic trajectory sentence.
 *
 * Deterministic: sorting and counting only; no randomness.
 */
function farmerArc(
  farmerId: number,
  name: string,
  finalRank: number,
  history: readonly RunHistoryRow[],
): string {
  // Collect this farmer's rows, oldest-first.
  const farmerRows = history
    .filter((r) => r.farmerId === farmerId)
    .sort((a, b) => a.day - b.day);

  if (farmerRows.length === 0) {
    return `${name} — no recorded history.`;
  }

  const totalDays = farmerRows.length;

  // Determine total number of farmers (= max rank seen across the entire history).
  let maxRankSeen = 0;
  for (const row of history) {
    if (row.rank > maxRankSeen) maxRankSeen = row.rank;
  }
  const lastPlace = maxRankSeen;

  // Days at last place.
  let daysLast = 0;
  for (const row of farmerRows) {
    if (row.rank === lastPlace) daysLast++;
  }

  // Days at 1st place.
  let daysFirst = 0;
  for (const row of farmerRows) {
    if (row.rank === 1) daysFirst++;
  }

  // "Surge" arc: ≥ 50% of days at last place AND final rank is 1.
  if (daysLast >= Math.ceil(totalDays * 0.5) && finalRank === 1) {
    return `${name} — last for ${daysLast} days, surged to 1st in the final stretch.`;
  }

  // "Collapse" arc: led ≥ 50% of days AND final rank ≥ 3.
  if (daysFirst >= Math.ceil(totalDays * 0.5) && finalRank >= 3) {
    return `${name} — led for ${daysFirst} days, then collapsed to ${finalRank}${rankSuffix(finalRank)}.`;
  }

  // "Steady" arc: top-half ≥ 75% of days.
  const topHalf = Math.ceil(lastPlace / 2);
  let daysInTopHalf = 0;
  for (const row of farmerRows) {
    if (row.rank <= topHalf) daysInTopHalf++;
  }
  const topHalfFrac = daysInTopHalf / totalDays;
  if (topHalfFrac >= 0.75) {
    return `${name} — steady all season, rarely left the top ${topHalf}.`;
  }

  // Generic fallback.
  return `${name} — finished ${finalRank}${rankSuffix(finalRank)} after a ${describeTrajectory(farmerRows)} run.`;
}

// ---------------------------------------------------------------------------
// Headline generation
// ---------------------------------------------------------------------------

/**
 * Pick the single most dramatic event for the run headline.
 *
 * Strategy (updated for brief 38 — drama scores):
 *
 * 1. If any event carries a drama score, prefer the **highest-drama** event
 *    as the headline source. Tie-break: latest day, then stable (insertion)
 *    order. This surfaces rank-flips, shocks, and auction wins automatically.
 * 2. Fallback when all drama scores are equal (or all events lack a score):
 *    use the original text-based heuristics:
 *    a. Biggest single gold trade (parse "(Xg)").
 *    b. Drought/blight event.
 *    c. Combination sentence when both are present.
 * 3. Ultimate fallback: "{winner} took the crown with {totalValue}g."
 *
 * Deterministic — sorting is by stable numeric fields; no randomness.
 */
function buildHeadline(
  events: readonly EventEntry[],
  winner: RecapStanding | undefined,
): string {
  // ---- 1. Drama-score path -------------------------------------------------
  // Find the event with the highest drama score (tie-break: latest day, then
  // stable order = last element among equals when iterating oldest-first).
  // `drama` is optional on EventEntry for back-compat with pre-38 callers
  // that omit the field; treat undefined as 0.

  // Compute max drama across all events.
  let maxDrama = 0;
  for (const e of events) {
    const d = e.drama ?? 0;
    if (d > maxDrama) maxDrama = d;
  }

  // Only use the drama path if at least one event has a non-zero score AND
  // the max is above a low-noise threshold (> 0.1) so routine trades with
  // drama=0.08 don't hijack the headline when there are no notable events.
  if (maxDrama > 0.1 && events.length > 0) {
    // Among events tied at maxDrama, pick the latest day (oldest-first list
    // means we scan forward and keep the last match = latest day + position).
    let best: EventEntry | null = null;
    for (const e of events) {
      if ((e.drama ?? 0) >= maxDrama) {
        // Replace best if same drama and same-or-later day (stable: later
        // position in the array wins among exact same-day ties).
        if (
          best === null ||
          e.day > best.day ||
          (e.day === best.day && (e.drama ?? 0) >= (best.drama ?? 0))
        ) {
          best = e;
        }
      }
    }
    if (best !== null) {
      return `The story of the run: ${best.text.charAt(0).toUpperCase() + best.text.slice(1)}.`;
    }
  }

  // ---- 2. Text-based fallback (original heuristics) -----------------------

  // Find the biggest gold trade by parsing "(Xg)" from event text.
  let biggestTrade: { text: string; value: number } | null = null;
  for (const e of events) {
    const m = e.text.match(/\((\d+)g\)/);
    if (m !== null && m[1] !== undefined) {
      const value = Number(m[1]);
      if (biggestTrade === null || value > biggestTrade.value) {
        biggestTrade = { text: e.text, value };
      }
    }
  }

  // Find the first drought/shock event (oldest-first order = deterministic).
  let shockText: string | null = null;
  for (const e of events) {
    if (e.text.startsWith("Drought!")) {
      shockText = e.text;
      break;
    }
  }

  if (biggestTrade !== null && shockText !== null) {
    return `The story of the run: ${shockText.toLowerCase()} while ${biggestTrade.text.toLowerCase()}.`;
  }
  if (biggestTrade !== null) {
    return `The story of the run: the biggest deal was ${biggestTrade.text.toLowerCase()}.`;
  }
  if (shockText !== null) {
    return `The story of the run: ${shockText.toLowerCase()}.`;
  }

  // ---- 3. Ultimate fallback -----------------------------------------------
  if (winner !== undefined) {
    return `The story of the run: ${winner.name} took the crown with ${winner.totalValue}g total value.`;
  }
  return "The story of the run: a close season from start to finish.";
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Build a RunRecap from the collected sim data.
 *
 * Pure function — no side effects, no Date.now, no Math.random.
 * Same (history, events, finalStandings, activeRivalries) → byte-identical RunRecap.
 *
 * @param history          Per-day rank rows from RunHistorySystem.history().
 * @param events           All event entries from EventFeedSystem.recent().
 * @param finalStandings   Final standings from buildFinalStandings(), sorted
 *                         by totalValue desc (rank 1 is index 0).
 * @param activeRivalries  Active rivalries/alliances from buildRivalriesData().
 *                         Optional for back-compat with existing tests.
 */
export function summarizeRun(
  history: readonly RunHistoryRow[],
  events: readonly EventEntry[],
  finalStandings: readonly FinalStandingRow[],
  activeRivalries?: readonly SnapshotRivalry[],
): RunRecap {
  // ---- standings + midRankDelta ------------------------------------------
  const mid = midpointDay(history);
  const rankMap = buildRankMap(history);
  const midDayMap = rankMap.get(mid) ?? new Map<number, number>();

  const standings: RecapStanding[] = finalStandings.map((row) => {
    const midRank = midDayMap.get(row.id) ?? row.rank;
    // midRankDelta: positive = improved since mid-season (lower rank number).
    // e.g. midRank 3 → finalRank 1: delta = 3 - 1 = +2 (improved by 2).
    const midRankDelta = midRank - row.rank;
    return {
      rank: row.rank,
      name: row.name,
      personality: row.personality,
      totalValue: row.totalValue,
      gold: row.gold,
      midRankDelta,
    };
  });

  // ---- arcs (ordered by final rank = finalStandings order) ---------------
  const arcs: string[] = finalStandings.map((row) =>
    farmerArc(row.id, row.name, row.rank, history),
  );

  // ---- headline ----------------------------------------------------------
  const winner = standings[0];
  const headline = buildHeadline(events, winner);

  // ---- rivalries (brief 37) -----------------------------------------------
  // Build one summary line per rivalry/alliance. If none, omit the field so
  // the recap panel cleanly skips the section (field is optional in RunRecap).
  let rivalriesLines: string[] | undefined;
  if (activeRivalries !== undefined && activeRivalries.length > 0) {
    rivalriesLines = activeRivalries.map((r) => {
      if (r.kind === "alliance") {
        return `${r.aName} and ${r.bName} formed an alliance`;
      }
      return `${r.aName} ⚔ ${r.bName} — ${r.score} adverse events`;
    });
  }

  return { standings, arcs, headline, ...(rivalriesLines !== undefined ? { rivalries: rivalriesLines } : {}) };
}
