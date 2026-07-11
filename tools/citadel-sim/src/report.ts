/**
 * Citadel headless run report — builds the shared `RunReport<TDay, TEnd>`
 * envelope (`@engine/core/sim`) from data this tool already has on hand:
 * `getSnapshot()` results collected during (events, per-day timeline) and
 * after (end state) a run. Pure observer: nothing here feeds back into a
 * tick, an RNG draw, or a command — emitting a report cannot move a
 * determinism baseline.
 *
 * See tools/run-sim/src/report.ts for the Farm-side sibling this mirrors
 * (same envelope, same `emitReport`-to-stdout-or-file shape).
 */
import { writeFileSync } from "node:fs";
import {
  capReportEvents,
  type RunReport,
  type RunReportEvent,
  type RunReportEventLog,
  type RunReportMeta,
} from "@engine/core/sim";
import { getProductionDef, type BuildingSnapshot, type RenderSnapshot } from "@citadel/sim-core";

/** Per-day compact aggregate — mirrors the per-day console line this tool already prints. */
export interface CitadelDaySummary {
  readonly day: number;
  readonly season: string;
  readonly tier: string;
  readonly pop: number;
  readonly popCap: number;
  readonly happiness: number;
  readonly breadStock: number;
  readonly woodStock: number;
  readonly buildingsNonRoad: number;
  readonly activeFires: number;
  readonly outbreakActive: boolean;
  readonly threatLevel: number;
}

/**
 * Building counts by role, split the way the settlement-tier ladder splits them
 * (see `countsTowardTier` in games/citadel/sim-core/src/systems/tiers.ts, which
 * this mirrors using the publicly exported `getProductionDef` rather than the
 * unexported helper itself): roads/bridges, walls, and gates are infrastructure
 * and fortification, not settlement size, so they're bucketed apart from the
 * "real" structures counted by type.
 */
export interface CitadelBuildingCounts {
  readonly nonRoad: Readonly<Record<string, number>>;
  readonly road: number;
  readonly wall: number;
  readonly gate: number;
}

/** Full end-of-run state — the complete picture, once (unlike the timeline, which is compact per day). */
export interface CitadelEndState {
  readonly tier: string;
  readonly population: number;
  readonly popCap: number;
  readonly happiness: number;
  readonly stockpiles: Readonly<Record<string, number>>;
  readonly buildings: CitadelBuildingCounts;
  readonly keepPresent: boolean;
  readonly keepSacked: boolean;
  readonly threatLevel: number;
  readonly defensiveStrength: number;
  readonly gameOver: boolean;
}

/**
 * `fire` and `disease` each run TWO sims for comparison (unmitigated vs
 * mitigated). Keeping this simple per the brief: `endState` carries both
 * halves, and `timeline`/`events` cover only the primary (unmitigated) run —
 * that's the run the hazard is proven against; the mitigated run is a
 * control, not the story being told.
 */
export interface CitadelComparisonEndState {
  readonly comparison: {
    readonly unmitigated: CitadelEndState;
    readonly mitigated: CitadelEndState;
  };
}

export type CitadelRunReport = RunReport<CitadelDaySummary, CitadelEndState>;
export type CitadelComparisonRunReport = RunReport<CitadelDaySummary, CitadelComparisonEndState>;

function bucketBuildings(buildings: readonly BuildingSnapshot[]): {
  counts: CitadelBuildingCounts;
  nonRoadTotal: number;
} {
  const nonRoad: Record<string, number> = {};
  let road = 0;
  let wall = 0;
  let gate = 0;
  let nonRoadTotal = 0;
  for (const b of buildings) {
    const prod = getProductionDef(b.type);
    if (prod?.isRoad === true) { road++; continue; }
    if (prod?.isWall === true) { wall++; continue; }
    if (prod?.isGate === true) { gate++; continue; }
    nonRoad[b.type] = (nonRoad[b.type] ?? 0) + 1;
    nonRoadTotal++;
  }
  return { counts: { nonRoad, road, wall, gate }, nonRoadTotal };
}

export function summarizeDay(snap: RenderSnapshot): CitadelDaySummary {
  const { nonRoadTotal } = bucketBuildings(snap.buildings);
  return {
    day: snap.day,
    season: snap.season,
    tier: snap.tier,
    pop: snap.population,
    popCap: snap.popCap,
    happiness: snap.happiness,
    breadStock: snap.stockpiles["bread"] ?? 0,
    woodStock: snap.stockpiles["wood"] ?? 0,
    buildingsNonRoad: nonRoadTotal,
    activeFires: snap.activeFires,
    outbreakActive: snap.outbreakActive,
    threatLevel: snap.threatLevel,
  };
}

export function summarizeEndState(snap: RenderSnapshot): CitadelEndState {
  const { counts } = bucketBuildings(snap.buildings);
  return {
    tier: snap.tier,
    population: snap.population,
    popCap: snap.popCap,
    happiness: snap.happiness,
    stockpiles: snap.stockpiles,
    buildings: counts,
    keepPresent: snap.keepPresent,
    keepSacked: snap.keepSacked,
    threatLevel: snap.threatLevel,
    defensiveStrength: snap.defensiveStrength,
    gameOver: snap.gameOver,
  };
}

/**
 * Incrementally harvests a COMPLETE cumulative event log from Citadel's
 * `recentEvents` — a MAX_EVENTS=20 capped tail (see `pushEvent` in
 * games/citadel/sim-core/src/sim-state.ts) — by diffing the monotonic
 * `eventsSeq` counter against each snapshot's tail.
 *
 * Sampling cadence: call `absorb` with `getSnapshot(tick)` on EVERY tick.
 * That bounds the gap between observations to a single tick's worth of
 * `pushEvent` calls, which is always far below the 20-entry cap in practice
 * (no system pushes anywhere near 20 events in one tick) — so `missed` should
 * read 0 for every scenario this tool ships. The gap math below is a safety
 * net for that assumption, not a currently-exercised path: if a future
 * scenario (or a coarser cadence) ever pushes more than 20 events between two
 * `absorb` calls, the excess is counted as `missed` rather than silently
 * dropped or double-counted.
 *
 * Citadel events are plain strings with no tick of their own — each is
 * stamped with the SAMPLING tick/day (the tick `absorb` was called at), not
 * the tick it actually fired on.
 */
export function createCitadelEventCollector(): {
  absorb: (snap: RenderSnapshot) => void;
  finish: () => RunReportEventLog;
} {
  let lastSeq = 0;
  const collected: RunReportEvent[] = [];
  let missed = 0;
  return {
    absorb(snap: RenderSnapshot): void {
      const delta = snap.eventsSeq - lastSeq;
      if (delta > 0) {
        const tail = snap.recentEvents;
        if (delta <= tail.length) {
          for (const text of tail.slice(tail.length - delta)) {
            collected.push({ tick: snap.tick, day: snap.day, text });
          }
        } else {
          // More events were pushed since the last observation than the tail
          // can hold — some are gone for good. Count them; don't fabricate text.
          missed += delta - tail.length;
          for (const text of tail) {
            collected.push({ tick: snap.tick, day: snap.day, text });
          }
        }
      }
      lastSeq = snap.eventsSeq;
    },
    finish(): RunReportEventLog {
      const capped = capReportEvents(collected);
      // capReportEvents always reports missed:0 (it only sees what made it into
      // `collected`); our sampling-gap count is orthogonal, so merge it in.
      return { ...capped, missed };
    },
  };
}

export interface CitadelReportMetaInput {
  readonly scenario: string;
  readonly seed: number;
  readonly ticksPerDay: number;
  readonly daysSimulated: number;
}

function buildMeta(input: CitadelReportMetaInput): RunReportMeta {
  return {
    game: "citadel",
    scenario: input.scenario,
    seed: input.seed,
    ticksPerDay: input.ticksPerDay,
    daysSimulated: input.daysSimulated,
  };
}

export function buildCitadelRunReport(
  meta: CitadelReportMetaInput,
  timeline: readonly CitadelDaySummary[],
  events: RunReportEventLog,
  endState: CitadelEndState,
  outcome: { readonly gameOver: boolean; readonly note?: string },
): CitadelRunReport {
  return {
    meta: buildMeta(meta),
    timeline,
    events,
    endState,
    outcome: { gameOver: outcome.gameOver, ...(outcome.note !== undefined ? { note: outcome.note } : {}) },
  };
}

export function buildCitadelComparisonRunReport(
  meta: CitadelReportMetaInput,
  timeline: readonly CitadelDaySummary[],
  events: RunReportEventLog,
  comparison: { readonly unmitigated: CitadelEndState; readonly mitigated: CitadelEndState },
  outcome: { readonly gameOver: boolean; readonly note?: string },
): CitadelComparisonRunReport {
  return {
    meta: buildMeta(meta),
    timeline,
    events,
    endState: { comparison },
    outcome: { gameOver: outcome.gameOver, ...(outcome.note !== undefined ? { note: outcome.note } : {}) },
  };
}

/** Mirrors tools/run-sim/src/report.ts's `emitReport`: stdout when no file, else write + a stderr note. */
export function emitCitadelReport(
  report: CitadelRunReport | CitadelComparisonRunReport,
  reportFile: string | undefined,
): void {
  const payload = JSON.stringify(report, null, 2) + "\n";
  if (reportFile !== undefined) {
    writeFileSync(reportFile, payload);
    console.error(`wrote report to ${reportFile}`);
  } else {
    process.stdout.write(payload);
  }
}
