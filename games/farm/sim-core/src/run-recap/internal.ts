import type { RunHistoryRow } from "../systems/messaging/run-history";
import type { EventEntry } from "../systems/event-feed";
import type { RecapStanding } from "./types";

export function midpointDay(history: readonly RunHistoryRow[]): number {
  if (history.length === 0) return 0;
  let maxDay = 0;
  for (const row of history) {
    if (row.day > maxDay) maxDay = row.day;
  }
  return Math.floor(maxDay / 2);
}

export function buildRankMap(
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

export function rankSuffix(rank: number): string {
  if (rank === 1) return "st";
  if (rank === 2) return "nd";
  if (rank === 3) return "rd";
  return "th";
}

export function describeTrajectory(rows: readonly RunHistoryRow[]): string {
  if (rows.length < 2) return "brief";
  const first = rows[0]!.rank;
  const last = rows[rows.length - 1]!.rank;
  if (last < first) return "rising";
  if (last > first) return "declining";
  return "consistent";
}

export function farmerArc(
  farmerId: number,
  name: string,
  finalRank: number,
  history: readonly RunHistoryRow[],
): string {
  const farmerRows = history
    .filter((r) => r.farmerId === farmerId)
    .sort((a, b) => a.day - b.day);

  if (farmerRows.length === 0) {
    return `${name} — no recorded history.`;
  }

  const totalDays = farmerRows.length;

  let maxRankSeen = 0;
  for (const row of history) {
    if (row.rank > maxRankSeen) maxRankSeen = row.rank;
  }
  const lastPlace = maxRankSeen;

  let daysLast = 0;
  for (const row of farmerRows) {
    if (row.rank === lastPlace) daysLast++;
  }

  let daysFirst = 0;
  for (const row of farmerRows) {
    if (row.rank === 1) daysFirst++;
  }

  if (daysLast >= Math.ceil(totalDays * 0.5) && finalRank === 1) {
    return `${name} — last for ${daysLast} days, surged to 1st in the final stretch.`;
  }

  if (daysFirst >= Math.ceil(totalDays * 0.5) && finalRank >= 3) {
    return `${name} — led for ${daysFirst} days, then collapsed to ${finalRank}${rankSuffix(finalRank)}.`;
  }

  const topHalf = Math.ceil(lastPlace / 2);
  let daysInTopHalf = 0;
  for (const row of farmerRows) {
    if (row.rank <= topHalf) daysInTopHalf++;
  }
  const topHalfFrac = daysInTopHalf / totalDays;
  if (topHalfFrac >= 0.75) {
    return `${name} — steady all season, rarely left the top ${topHalf}.`;
  }

  return `${name} — finished ${finalRank}${rankSuffix(finalRank)} after a ${describeTrajectory(farmerRows)} run.`;
}

export function buildHeadline(
  events: readonly EventEntry[],
  winner: RecapStanding | undefined,
): string {
  let maxDrama = 0;
  for (const e of events) {
    const d = e.drama ?? 0;
    if (d > maxDrama) maxDrama = d;
  }

  if (maxDrama > 0.1 && events.length > 0) {
    let best: EventEntry | null = null;
    for (const e of events) {
      if ((e.drama ?? 0) >= maxDrama) {
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

  if (winner !== undefined) {
    return `The story of the run: ${winner.name} took the crown with ${winner.totalValue}g total value.`;
  }
  return "The story of the run: a close season from start to finish.";
}
