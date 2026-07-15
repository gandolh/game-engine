/**
 * The Citadel tick-loop drivers — mirrors tools/run-sim/src/run-core.ts's role
 * (the reusable "run to completion and collect" driver), scoped to the two
 * A/B comparison scenarios (fire, disease) that need to run two sims back to back.
 */
import { bootstrapSim } from "@citadel/sim-core";
import type { CitadelCommand, TerrainGrid, RenderSnapshot } from "@citadel/sim-core";
import type { RunReportEventLog } from "@engine/core/sim";
import {
  summarizeDay,
  summarizeEndState,
  createCitadelEventCollector,
  buildCitadelComparisonRunReport,
  type CitadelDaySummary,
  type CitadelComparisonRunReport,
} from "./report";
import { buildFireCommands, buildDiseaseScenario } from "./scenarios";
import { SEED, TICKS_PER_DAY, MAX_DAYS, SCENARIO } from "./env";

/**
 * Run a single headless sim with the given commands and return fire + event stats.
 *
 * `collect`: when true, also samples `getSnapshot(tick)` on EVERY tick (not just
 * at day boundaries) to build a complete report timeline + event log via
 * `createCitadelEventCollector` (see report.ts for why every-tick sampling is the
 * safe cadence against the 20-entry `recentEvents` cap). When false, behavior —
 * including the number and arguments of `getSnapshot` calls — is unchanged from
 * before the report existed.
 */
export function runOneSim(
  cmds: CitadelCommand[],
  label: string,
  collect: boolean,
): {
  fires: number;
  deaths: number;
  finalPop: number;
  events: string[];
  finalSnapshot: RenderSnapshot;
  timeline: CitadelDaySummary[];
  eventLog: RunReportEventLog | null;
} {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });
  for (const c of cmds) sim.commands.enqueue(c);
  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  let fireEvents = 0;
  let deathEvents = 0;
  let lastDay = -1;
  const allEvents: string[] = [];
  const timeline: CitadelDaySummary[] = [];
  const collector = collect ? createCitadelEventCollector() : null;
  console.log(`\n--- ${label} ---`);
  for (let tick = 0; tick < totalTicks; tick++) {
    sim.scheduler.tick({ tick });
    let tickSnap: RenderSnapshot | undefined;
    if (collector !== null) {
      tickSnap = sim.getSnapshot(tick);
      collector.absorb(tickSnap);
    }
    if (sim.dayClock.day !== lastDay) {
      lastDay = sim.dayClock.day;
      const snap = tickSnap ?? sim.getSnapshot(tick);
      const hazardStr = (snap.activeFires > 0 || snap.outbreakActive)
        ? ` | fires=${snap.activeFires} sick=${snap.sickVillagers}${snap.outbreakActive ? " [OUTBREAK]" : ""}`
        : "";
      console.log(
        `  Day ${String(snap.day + 1).padStart(2)}/${MAX_DAYS} pop=${snap.population}/${snap.popCap}` +
        ` bread=${snap.stockpiles.bread ?? 0} happy=${snap.happiness}${hazardStr}`,
      );
      for (const ev of snap.recentEvents) {
        if (!allEvents.includes(ev)) {
          allEvents.push(ev);
          if (/fire|burned|disease|outbreak|died/i.test(ev)) {
            console.log(`    >> ${ev}`);
            if (/fire|burned/i.test(ev)) fireEvents++;
            if (/died/i.test(ev)) deathEvents++;
          }
        }
      }
      if (collect) timeline.push(summarizeDay(snap));
    }
    if (sim.gameOver) break;
  }
  const final = sim.getSnapshot(totalTicks);
  return {
    fires: fireEvents,
    deaths: deathEvents,
    finalPop: final.population,
    events: allEvents,
    finalSnapshot: final,
    timeline,
    eventLog: collector !== null ? collector.finish() : null,
  };
}

/**
 * Run two disease sims (no-healer vs with-healer) and print a comparison.
 * Report timeline/events cover only the unmitigated (primary) run; `report`
 * gates BOTH the extra per-tick sampling AND whether a report is built at all
 * — false is zero behavior/perf change from before the report existed.
 */
export function runDiseaseComparison(terrain: TerrainGrid, report: boolean): CitadelComparisonRunReport | null {
  console.log(`\n=== DISEASE COMPARISON: crowded housing (seed=0x${SEED.toString(16)}) ===`);
  const resultCrowded   = runOneSim(buildDiseaseScenario(terrain, false), "CROWDED — no healer (unmitigated)", report);
  const resultMitigated = runOneSim(buildDiseaseScenario(terrain, true),  "MITIGATED — healer in range", false);
  console.log("\n=== DISEASE COMPARISON SUMMARY ===");
  console.log(`  Unmitigated: ${resultCrowded.deaths} disease deaths, final pop ${resultCrowded.finalPop}`);
  console.log(`  Mitigated:   ${resultMitigated.deaths} disease deaths, final pop ${resultMitigated.finalPop}`);
  let resultLine: string;
  if (resultCrowded.deaths > resultMitigated.deaths) {
    resultLine = `Healer REDUCED deaths (${resultCrowded.deaths} → ${resultMitigated.deaths}). Disease hazard proven!`;
  } else if (resultCrowded.deaths > 0) {
    resultLine = `Disease deaths occurred in both runs; healer provided partial mitigation.`;
  } else {
    resultLine = `No disease deaths in this seed/day count — try higher MAX_DAYS or more crowding.`;
  }
  console.log(`  RESULT: ${resultLine}`);
  if (!report) return null;
  return buildCitadelComparisonRunReport(
    { scenario: SCENARIO, seed: SEED, ticksPerDay: TICKS_PER_DAY, daysSimulated: resultCrowded.finalSnapshot.day },
    resultCrowded.timeline,
    resultCrowded.eventLog!,
    {
      unmitigated: summarizeEndState(resultCrowded.finalSnapshot),
      mitigated: summarizeEndState(resultMitigated.finalSnapshot),
    },
    { gameOver: resultCrowded.finalSnapshot.gameOver, note: resultLine },
  );
}

/**
 * Run two fire sims (no-well vs with-well) and print a comparison.
 * Report timeline/events cover only the unmitigated (primary) run; `report`
 * gates BOTH the extra per-tick sampling AND whether a report is built at all
 * — false is zero behavior/perf change from before the report existed.
 */
export function runFireComparison(terrain: TerrainGrid, report: boolean): CitadelComparisonRunReport | null {
  console.log(`\n=== FIRE COMPARISON: dense wooden district (seed=0x${SEED.toString(16)}) ===`);
  const resultDense    = runOneSim(buildFireCommands(terrain, false), "DENSE — no well (unmitigated)", report);
  const resultMitigated = runOneSim(buildFireCommands(terrain, true),  "MITIGATED — well inside district", false);
  console.log("\n=== FIRE COMPARISON SUMMARY ===");
  console.log(`  Unmitigated: ${resultDense.fires} fire events, final pop ${resultDense.finalPop}`);
  console.log(`  Mitigated:   ${resultMitigated.fires} fire events, final pop ${resultMitigated.finalPop}`);
  let resultLine: string;
  if (resultDense.fires > resultMitigated.fires) {
    resultLine = `Well REDUCED fire events (${resultDense.fires} → ${resultMitigated.fires}). Fire hazard proven!`;
  } else if (resultDense.fires > 0) {
    resultLine = `Fire occurred in both runs (hazard proven); well provided partial mitigation.`;
  } else {
    resultLine = `No fires in this seed/day count — try a higher MAX_DAYS or denser layout.`;
  }
  console.log(`  RESULT: ${resultLine}`);
  if (!report) return null;
  return buildCitadelComparisonRunReport(
    { scenario: SCENARIO, seed: SEED, ticksPerDay: TICKS_PER_DAY, daysSimulated: resultDense.finalSnapshot.day },
    resultDense.timeline,
    resultDense.eventLog!,
    {
      unmitigated: summarizeEndState(resultDense.finalSnapshot),
      mitigated: summarizeEndState(resultMitigated.finalSnapshot),
    },
    { gameOver: resultDense.finalSnapshot.gameOver, note: resultLine },
  );
}
