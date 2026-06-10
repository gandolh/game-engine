/**
 * run-recap — pure synthesis module for the end-of-run "Legends" recap.
 *
 * All exports are pure functions of their inputs: no side effects, no
 * Date.now / Math.random. Same inputs → byte-identical RunRecap.
 *
 * Imported by snapshot-builder at game-over to embed the recap in the
 * RenderSnapshot, and by run-recap.test.ts for unit tests.
 */

import type { RunHistoryRow } from "../systems/run-history";
import type { FinalStandingRow, SnapshotRivalry } from "../snapshot";
import type { EventEntry } from "../systems/event-feed";
import { midpointDay, buildRankMap, farmerArc, buildHeadline } from "./internal";
import type { RecapStanding, RunRecap } from "./types";

export type { RecapStanding, RunRecap };

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
