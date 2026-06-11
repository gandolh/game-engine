// Pure synthesis — no side effects, no Date.now/Math.random; same inputs → byte-identical output.

import type { RunHistoryRow } from "../systems/run-history";
import type { FinalStandingRow, SnapshotRivalry } from "../snapshot";
import type { EventEntry } from "../systems/event-feed";
import { midpointDay, buildRankMap, farmerArc, buildHeadline } from "./internal";
import type { RecapStanding, RunRecap } from "./types";

export type { RecapStanding, RunRecap };

export function summarizeRun(
  history: readonly RunHistoryRow[],
  events: readonly EventEntry[],
  finalStandings: readonly FinalStandingRow[],
  activeRivalries?: readonly SnapshotRivalry[],
): RunRecap {
  const mid = midpointDay(history);
  const rankMap = buildRankMap(history);
  const midDayMap = rankMap.get(mid) ?? new Map<number, number>();

  const standings: RecapStanding[] = finalStandings.map((row) => {
    const midRank = midDayMap.get(row.id) ?? row.rank;
    // midRankDelta: positive = improved since mid-season (e.g. midRank 3 → finalRank 1: delta = +2).
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

  const arcs: string[] = finalStandings.map((row) =>
    farmerArc(row.id, row.name, row.rank, history),
  );

  const winner = standings[0];
  const headline = buildHeadline(events, winner);

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
