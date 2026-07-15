/**
 * Citadel headless sim runner.
 *
 * Drives bootstrapSim() directly on the main thread — no Worker.
 * Places a well-connected economy near the map center, then prints a per-day
 * economy summary from getSnapshot().
 *
 * Six scenarios are supported via the SCENARIO env var:
 *   SCENARIO=grow   (default) — full economy; should see pop growing and
 *                               winter halting grain but not killing the town
 *                               if autumn surplus was large enough.
 *   SCENARIO=starve — minimal economy with no autumn surplus; winter bread
 *                     shortfall triggers population decline and game-over.
 *   SCENARIO=siege  — a heavily fortified citadel (keep + towers + garrison +
 *                     walls + gates) on top of a large economy; raids arrive
 *                     from ~day 5 and are REPELLED by the strong defenses.
 *                     Refining chains (quarry→stone, sawmill→planks, smith→tools)
 *                     are active and produce visible output.
 *   SCENARIO=sack   — a REAL PLAYTHROUGH of the sharp raid path: a fire-safe
 *                     lattice town grows to Town tier, legitimately unlocks and
 *                     raises a lone keep (defense 8, no walls), and is then ground
 *                     down by escalating raids → keepSacked=true, game-over from
 *                     the SACK (not starvation). The ONLY fixture that drives the
 *                     sharp (cozyThreats:false) raid resolution end to end.
 *   SCENARIO=fire   — dense wooden buildings packed close together → fire
 *                     ignites and spreads. Second half places wells to show
 *                     reduced fire spread. Expect fire events in the log.
 *   SCENARIO=disease — crowded housing + low happiness → disease outbreak.
 *                      Second half places a healer to show reduced mortality.
 *
 * Usage:
 *   npm run sim:citadel
 *   SEED=0xdeadbeef MAX_DAYS=40 npm run sim:citadel
 *   SCENARIO=starve MAX_DAYS=25 npm run sim:citadel
 *   SCENARIO=siege  MAX_DAYS=40 npm run sim:citadel
 *   SCENARIO=sack   npm run sim:citadel      # 70-day default — see SACK_MAX_DAYS
 *   SCENARIO=fire   MAX_DAYS=40 npm run sim:citadel
 *   SCENARIO=disease MAX_DAYS=40 npm run sim:citadel
 *
 * Module layout (mirrors tools/run-sim/src/):
 *   env.ts        — flag/env parsing (SEED, TICKS_PER_DAY, SCENARIO, REPORT, MAX_DAYS, …)
 *   scenarios/    — the six SCENARIO fixture builders + shared placement helpers
 *   run-core.ts   — the fire/disease A/B comparison tick-loop driver (runOneSim et al.)
 *   format.ts     — console output formatting for the main scenario loop
 *   report.ts     — RunReport collection (unchanged; already split before this brief)
 *   index.ts      — this file: thin entry, wires the above together
 */
import { bootstrapSim, tierAtLeast, localPlayer } from "@citadel/sim-core";
import type { RenderSnapshot } from "@citadel/sim-core";
import {
  summarizeDay,
  summarizeEndState,
  createCitadelEventCollector,
  buildCitadelRunReport,
  emitCitadelReport,
  type CitadelDaySummary,
  type CitadelRunReport,
} from "./report";
import { buildGrowScenario, buildStarveScenario, buildSiegeScenario, buildSackScenario } from "./scenarios";
import { runFireComparison, runDiseaseComparison } from "./run-core";
import {
  printMainDayLine,
  printNotableEvents,
  printFinalSummary,
  MAIN_NOTABLE_EVENT_PATTERN,
  SACK_VERDICT_PASS,
  formatSackFailure,
} from "./format";
import { SEED, TICKS_PER_DAY, MAX_DAYS, SCENARIO, REPORT, REPORT_FILE, isSiegeScenario } from "./env";

function main(): void {
  console.log(
    `Citadel headless sim — seed=0x${SEED.toString(16)}, ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day [scenario: ${SCENARIO}]`,
  );

  const startDay = SCENARIO === "starve" ? 12 : 0;
  // The siege/sack scenarios exist to exercise the SHARP raid resolution
  // (resolveSiege's repelled/damage/sacked bands). `cozyThreats` defaults to TRUE
  // (cozy pivot Phase D, 2026-07-01), and under it a raid pilfers goods and leaves —
  // it can never sack, by contract. So these two scenarios must opt into the sharp
  // path explicitly, or they silently assert nothing: `sack` ran the cozy path and
  // stopped sacking the day the pivot landed, and nobody noticed for ten days.
  const sim = bootstrapSim({
    seed: SEED,
    ticksPerDay: TICKS_PER_DAY,
    startDay,
    ...(isSiegeScenario() ? { cozyThreats: false } : {}),
  });
  const { scheduler, dayClock, terrain, commands, getSnapshot } = sim;

  console.log(`Terrain generated: ${terrain.width}×${terrain.height} tiles`);

  let injectWoodPerDay = 0;
  let injectStonePerDay = 0;
  // `sack` builds its keep LATE, through the real TIER_LOCK gate — see below.
  let sackKeep: { x: number; y: number } | null = null;
  let sackKeepOrdered = false;
  if (SCENARIO === "siege") {
    const result = buildSiegeScenario(terrain);
    for (const c of result.cmds) commands.enqueue(c);
    injectWoodPerDay = result.injectWoodPerDay;
    injectStonePerDay = result.injectStonePerDay;
  } else if (SCENARIO === "sack") {
    const plan = buildSackScenario(terrain);
    for (const c of plan.cmds) commands.enqueue(c);
    sackKeep = plan.keep;
  } else if (SCENARIO === "starve") {
    const cmds = buildStarveScenario(terrain);
    for (const c of cmds) commands.enqueue(c);
  } else if (SCENARIO === "fire") {
    // Fire scenario: run two sims — dense WITHOUT well vs dense WITH well.
    // This is a standalone comparison; main loop below is skipped for this branch.
    const rep = runFireComparison(terrain, REPORT);
    if (rep !== null) emitCitadelReport(rep, REPORT_FILE);
    return;
  } else if (SCENARIO === "disease") {
    // Disease scenario: run two sims — crowded without healer vs with healer.
    const rep = runDiseaseComparison(terrain, REPORT);
    if (rep !== null) emitCitadelReport(rep, REPORT_FILE);
    return;
  } else {
    const cmds = buildGrowScenario(terrain);
    for (const c of cmds) commands.enqueue(c);
  }

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  let lastDay = -1;
  // Track which events we've already printed to show NEW events each day.
  let printedEventCount = 0;

  // Report collection (only when REPORT is requested — see report.ts for why
  // every-tick sampling is the safe cadence against the recentEvents cap).
  const eventCollector = REPORT ? createCitadelEventCollector() : null;
  const timeline: CitadelDaySummary[] = [];

  for (let tick = 0; tick < totalTicks; tick++) {
    // Inject raw materials before each day boundary so converters always have input.
    // Both injections are deterministic: fixed amounts, same every day.
    if (tick % TICKS_PER_DAY === 0) {
      if (injectWoodPerDay > 0) sim.stockpiles.wood  += injectWoodPerDay;
      if (injectStonePerDay > 0) sim.stockpiles.stone += injectStonePerDay;
    }

    scheduler.tick({ tick });

    let tickSnap: RenderSnapshot | undefined;
    if (eventCollector !== null) {
      tickSnap = getSnapshot(tick);
      eventCollector.absorb(tickSnap);
    }

    if (dayClock.day !== lastDay) {
      lastDay = dayClock.day;
      const snap = tickSnap ?? getSnapshot(tick);

      // `sack`: the keep is TIER_LOCKed to Town, so it cannot be placed at founding —
      // the old fixture tried, was rejected, and therefore never had anything to sack.
      // Order it the moment the settlement EARNS Town, exactly as a player would. The
      // command drains on the next tick's "commands" stage; the decision is a pure
      // function of sim state, so the run stays deterministic.
      // Read `peakTier` off the player rather than `snap.tier`: it is the typed
      // `SettlementTier` (the snapshot widens it to `string`), and it is the exact field
      // `placeOne`'s tier gate consults via `unlockTier` — so the fixture asks the same
      // question the tier-lock will answer.
      if (sackKeep !== null && !sackKeepOrdered && tierAtLeast(localPlayer(sim.state).peakTier, "Town")) {
        commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: sackKeep.x, y: sackKeep.y } });
        sackKeepOrdered = true;
        console.log(`    >> Day ${snap.day + 1}: Town tier earned — raising the keep (defense 8, no walls).`);
      }

      printMainDayLine(snap, MAX_DAYS, SCENARIO, isSiegeScenario());

      // Print NEW events that arrived since the last day print (siege + hazards + tier).
      const newEvents = snap.recentEvents.slice(printedEventCount);
      printedEventCount = snap.recentEvents.length;
      printNotableEvents(newEvents, MAIN_NOTABLE_EVENT_PATTERN);

      if (REPORT) timeline.push(summarizeDay(snap));
    }

    if (sim.gameOver) break;
  }

  const final = getSnapshot(totalTicks);
  printFinalSummary(final, MAX_DAYS, SCENARIO, isSiegeScenario());

  // `sack` is the only fixture that drives the SHARP raid resolution end to end, and it
  // rotted for ten days precisely because nothing ever said so out loud: it kept printing
  // a cheerful economy summary while asserting nothing. Give it a verdict and a non-zero
  // exit, so a future regression is a FAILURE and not a paragraph nobody reads.
  const sackPassed = final.keepSacked && final.gameOver;

  // Per-scenario one-liner (or, for `sack`, the PASS/FAIL verdict) — goes in both the
  // console output (unchanged text) and the report's `outcome.note`.
  let note: string;
  if (SCENARIO === "sack") {
    note = sackPassed ? SACK_VERDICT_PASS : formatSackFailure(final);
    console.log(`\n${note}`);
  } else if (SCENARIO === "starve") {
    note = final.gameOver
      ? `the town starved out (population reached zero) by day ${final.day + 1}`
      : `the town survived to day ${final.day + 1} without starving`;
  } else if (isSiegeScenario()) {
    note = `pop ${final.population}, tier ${final.tier}, keepSacked=${final.keepSacked}`;
  } else {
    note = `pop ${final.population}, tier ${final.tier}`;
  }

  if (REPORT) {
    const report: CitadelRunReport = buildCitadelRunReport(
      { scenario: SCENARIO, seed: SEED, ticksPerDay: TICKS_PER_DAY, daysSimulated: final.day },
      timeline,
      eventCollector!.finish(),
      summarizeEndState(final),
      { gameOver: final.gameOver, note },
    );
    emitCitadelReport(report, REPORT_FILE);
  }

  if (SCENARIO === "sack" && !sackPassed) {
    process.exit(1);
  }
  process.exit(0);
}

main();
