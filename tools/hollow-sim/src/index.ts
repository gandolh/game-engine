/**
 * Hollow headless research CLI (chunk hollow-07) — the M1 exit vehicle.
 *
 * Runs a seeded Hollow population over many generations, samples emergence
 * metrics on a fixed cadence, captures the full family/community/social
 * event chronicle, and exports all three to disk for offline study — the
 * headless research-instrument shape `tools/run-sim` established for Farm,
 * adapted to Hollow's lifecycle/genetics/social-verb systems instead of
 * Farm's economy.
 *
 * Usage:
 *   npm run sim:hollow                              # default research profile, seed 0x1a1100, 15 years
 *   SEED=7 MAX_YEARS=12 npm run sim:hollow           # a specific seed/run length
 *   EXPORT=json EXPORT_DIR=./out npm run sim:hollow  # JSON metrics instead of CSV, custom output dir
 *   PERSONA_SEED=./founders.json npm run sim:hollow  # founder genome overrides (see persona.ts)
 *   INTERVENTION_LOG=./shocks.json npm run sim:hollow  # replay a recorded shock log (see intervention-log.ts)
 *   npm run check-determinism -w @tool/hollow-sim    # same seed(s) twice, byte-identical assertion
 *
 * See `env.ts` for every knob + the default RESEARCH_PROFILE and why it
 * exists (production lifecycle constants are far too slow for a headless
 * multi-generation run).
 */
import { runResearch, type RunResult } from "./run-core";
import { metricsCsv, metricsJson, eventsJsonl, lineageJson, writeExportFile } from "./export";
import { runDeterminismCheck } from "./determinism";
import {
  SEED,
  TICKS_PER_YEAR,
  MAX_YEARS,
  DETERMINISM_MAX_YEARS,
  EXPORT,
  EXPORT_DIR,
  PERSONA_SEED,
  INTERVENTION_LOG,
  CHECK_DETERMINISM,
  buildSimOptions,
  determinismSeeds,
} from "./env";

function printSummary(result: RunResult): void {
  const s = result.summary;
  console.log();
  console.log("=".repeat(72));
  console.log(`  HOLLOW — research run summary (seed 0x${(s.seed >>> 0).toString(16)})`);
  console.log("=".repeat(72));
  console.log(`  ticks run:              ${s.ticksRun}`);
  console.log(`  generations of descent: ${s.generationsOfDescent}`);
  console.log(`  final population:       ${s.finalPopulation}`);
  console.log(`  total births:           ${s.totalBirths}`);
  console.log(
    `  deaths — oldAge: ${s.deathsByCause.oldAge}, starvation: ${s.deathsByCause.starvation}, violence: ${s.deathsByCause.violence}, disease: ${s.deathsByCause.disease}`,
  );
  console.log(`  cooperative events:     ${s.totalCoopEvents}`);
  console.log(`  antagonistic events:    ${s.totalAntagEvents}`);
  console.log(`  communities formed:     ${s.communitiesFormed}`);
  console.log(`  communities dissolved:  ${s.communitiesDissolved}`);
  console.log("=".repeat(72));
}

function main(): void {
  if (CHECK_DETERMINISM) {
    const passed = runDeterminismCheck({
      seeds: determinismSeeds(),
      ticksPerYear: TICKS_PER_YEAR,
      maxYears: DETERMINISM_MAX_YEARS,
      ...(PERSONA_SEED !== undefined ? { personaSeedPath: PERSONA_SEED } : {}),
    });
    process.exit(passed ? 0 : 1);
    return;
  }

  const simOptions = buildSimOptions(SEED);
  console.log(
    `Hollow headless research run — seed=0x${SEED.toString(16)}, ${MAX_YEARS} year(s) @ ${TICKS_PER_YEAR} ticks/year (population=${simOptions.population})`,
  );

  const result = runResearch({
    simOptions,
    ticksPerYear: TICKS_PER_YEAR,
    maxYears: MAX_YEARS,
    ...(PERSONA_SEED !== undefined ? { personaSeedPath: PERSONA_SEED } : {}),
    ...(INTERVENTION_LOG !== undefined ? { interventionLogPath: INTERVENTION_LOG } : {}),
  });

  const metricsIsJson = EXPORT === "json";
  const metricsPayload = metricsIsJson ? metricsJson(result.metricsRows) : metricsCsv(result.metricsRows);
  const metricsFile = metricsIsJson ? "metrics.json" : "metrics.csv";

  writeExportFile(EXPORT_DIR, metricsFile, metricsPayload);
  writeExportFile(EXPORT_DIR, "events.jsonl", eventsJsonl(result.events));
  writeExportFile(EXPORT_DIR, "lineage.json", lineageJson(result.lineage));

  console.log(`wrote ${result.metricsRows.length} metrics row(s) to ${EXPORT_DIR}/${metricsFile}`);
  console.log(`wrote ${result.events.length} event(s) to ${EXPORT_DIR}/events.jsonl`);
  console.log(`wrote ${result.lineage.length} lineage entrie(s) to ${EXPORT_DIR}/lineage.json`);

  printSummary(result);
  process.exit(0);
}

main();
