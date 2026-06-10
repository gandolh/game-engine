/**
 * index.ts — the headless-run CLI entrypoint. Thin dispatcher over three modes:
 *
 *   CHECK_DETERMINISM=1   run each seed twice (in parallel workers), compare
 *   EXPORT=csv|json       machine-readable per-day rows to EXPORT_FILE/stdout
 *   (default)             human-readable per-day + final leaderboard
 *
 * Sim logic lives in run-core.ts (side-effect free, shared with the worker);
 * env parsing in env.ts; output formatting in format.ts.
 */
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { ONT_SIMULATION, type ShockBody } from "@farm/sim-core/protocols";
import { runOnce, summarize } from "./run-core";
import { makePathfinder } from "./pathfinder";
import { runDeterminismCheck } from "./determinism";
import { printDayLine, printFinalLeaderboard, emitExport } from "./format";
import {
  SEED,
  TICKS_PER_DAY,
  MAX_DAYS,
  PROGRESS_EVERY,
  CHECK_DETERMINISM,
  EXPORT,
  EXPORT_FILE,
  determinismSeeds,
} from "./env";

async function main(): Promise<void> {
  if (CHECK_DETERMINISM) {
    // Multi-seed sanity: SEEDS=a,b,c overrides the single SEED. Each seed is
    // verified internally reproducible (run twice, compare). Diagnostics go to
    // stderr so a piped CSV/stdout never gets polluted.
    const passed = await runDeterminismCheck({
      seeds: determinismSeeds(),
      ticksPerDay: TICKS_PER_DAY,
      maxDays: MAX_DAYS,
    });
    process.exit(passed ? 0 : 1);
  } else if (EXPORT === "csv" || EXPORT === "json") {
    // Export mode: machine-readable per-day rows. Suppress the human-readable
    // leaderboard so stdout stays clean for piping.
    const result = runOnce({
      seed: SEED,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: MAX_DAYS,
      pathfinder: makePathfinder(),
    });
    emitExport(EXPORT, result, EXPORT_FILE);
  } else {
    // Default mode — human-readable run.
    const { world, scheduler, dayClock, bus } = bootstrapSim({
      seed: SEED,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: MAX_DAYS,
      pathfinder: makePathfinder(),
    });

    // Narrate the mid-game shock when it fires (otherwise it's an invisible moment).
    bus.subscribeOntology(ONT_SIMULATION.SHOCK, (msg) => {
      const b = msg.body as unknown as ShockBody;
      console.log(
        `  *** SHOCK day ${b.day}: ${b.kind} struck ${b.targetName} — ${b.plotsWiped} planted plot(s) wiped ***`,
      );
    });

    console.log(
      `Farm Valley headless run — seed=0x${SEED.toString(16)}, ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day`,
    );
    console.log();

    const totalTicks = MAX_DAYS * TICKS_PER_DAY;
    let lastReported = -1;
    for (let tick = 0; tick < totalTicks; tick++) {
      scheduler.tick({ tick });
      // InboxDispatchSystem already flushed this tick's messages into the bus's
      // deliverable buffer; fire subscriber handlers so the shock narration prints.
      bus.notifySubscribers();
      if (dayClock.day !== lastReported && dayClock.day % PROGRESS_EVERY === 0) {
        const { weather, summaries } = summarize(world);
        printDayLine(dayClock.day, weather, summaries);
        lastReported = dayClock.day;
      }
    }

    const { weather, summaries } = summarize(world);
    printFinalLeaderboard(dayClock.day, weather, summaries);
  }
}

void main();
