
import { writeFileSync } from "node:fs";
import {
  capReportEvents,
  type RunReport,
  type RunReportEvent,
} from "@engine/core/sim";
import type { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import type { DaySnapshot, FarmerSummary, RunResult } from "./run-core";

export interface FarmDaySnapshot {
  day: number;
  weather: string;
  totalGold: number;
  totalUnsoldValue: number;
  leaderName: string;
  leaderTotalValue: number;
}

export interface FarmEndState {
  finalDay: number;
  finalWeather: string;
  standings: FarmerSummary[];
}

export type FarmRunReport = RunReport<FarmDaySnapshot, FarmEndState>;

export interface FarmReportMetaInput {
  seed: number;
  worldSeed?: number;
  ticksPerDay: number;
}

function summarizeDay(snap: DaySnapshot): FarmDaySnapshot {
  let totalGold = 0;
  let totalUnsoldValue = 0;
  let leader: FarmerSummary | undefined;
  for (const s of snap.summaries) {
    totalGold += s.gold;
    totalUnsoldValue += s.unsoldValue;
    if (leader === undefined || s.totalValue > leader.totalValue) leader = s;
  }
  return {
    day: snap.day,
    weather: snap.weather,
    totalGold,
    totalUnsoldValue,
    leaderName: leader?.name ?? "",
    leaderTotalValue: leader?.totalValue ?? 0,
  };
}

export function buildFarmRunReport(
  result: RunResult,
  events: readonly RunReportEvent[],
  meta: FarmReportMetaInput,
): FarmRunReport {
  return {
    meta: {
      game: "farm-valley",
      seed: meta.seed,
      ...(meta.worldSeed !== undefined ? { worldSeed: meta.worldSeed } : {}),
      ticksPerDay: meta.ticksPerDay,
      daysSimulated: result.finalDay,
    },
    timeline: result.perDay.map(summarizeDay),
    events: capReportEvents(events),
    endState: {
      finalDay: result.finalDay,
      finalWeather: result.finalWeather,
      standings: result.finalStandings,
    },
    outcome: { gameOver: false },
  };
}

/**
 * Incrementally harvests a COMPLETE cumulative event log from the Farm
 * EventFeedSystem, which only retains a capped tail (EVENT_FEED_CAP). Call
 * `harvest` every tick (or at least every few ticks) with the booted sim —
 * it tracks a tick high-water mark and only appends entries newer than the
 * last harvest, so nothing is double-counted and nothing is missed as long
 * as no single tick emits more than the feed's cap in one shot.
 */
export function createFarmEventHarvester(): {
  harvest: (sim: ReturnType<typeof bootstrapSim>) => void;
  collected: () => RunReportEvent[];
} {
  let lastSeenTick = -1;
  const collected: RunReportEvent[] = [];
  return {
    harvest(sim: ReturnType<typeof bootstrapSim>): void {
      for (const e of sim.eventFeed.recent()) {
        if (e.tick <= lastSeenTick) continue;
        collected.push({ tick: e.tick, day: e.day, text: e.text });
        if (e.tick > lastSeenTick) lastSeenTick = e.tick;
      }
    },
    collected: () => collected,
  };
}

/** Mirrors emitExport's (format.ts) file-vs-stdout precedent. */
export function emitReport(report: FarmRunReport, reportFile?: string): void {
  const payload = JSON.stringify(report, null, 2) + "\n";
  if (reportFile) {
    writeFileSync(reportFile, payload);
    console.error(`wrote report to ${reportFile}`);
  } else {
    process.stdout.write(payload);
  }
}
