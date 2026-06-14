
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { ONT_SIMULATION, type ShockBody } from "@farm/sim-core/protocols";
import { runOnce, summarize } from "./run-core";
import { makePathfinder } from "./pathfinder";
import { runDeterminismCheck } from "./determinism";
import { printDayLine, printFinalLeaderboard, emitExport } from "./format";
import {
  SEED,
  WORLD_SEED,
  TICKS_PER_DAY,
  MAX_DAYS,
  PROGRESS_EVERY,
  CHECK_DETERMINISM,
  EXPORT,
  EXPORT_FILE,
  determinismSeeds,
} from "./env";

const WORLD_SEED_OPT = WORLD_SEED !== undefined ? { worldSeed: WORLD_SEED } : {};

async function main(): Promise<void> {
  if (CHECK_DETERMINISM) {
    const passed = await runDeterminismCheck({
      seeds: determinismSeeds(),
      ticksPerDay: TICKS_PER_DAY,
      maxDays: MAX_DAYS,
      ...WORLD_SEED_OPT,
    });
    process.exit(passed ? 0 : 1);
  } else if (EXPORT === "csv" || EXPORT === "json") {
    const result = runOnce({
      seed: SEED,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: MAX_DAYS,
      pathfinder: await makePathfinder(),
      ...WORLD_SEED_OPT,
    });
    emitExport(EXPORT, result, EXPORT_FILE);
  } else {
    const { world, scheduler, dayClock, bus } = bootstrapSim({
      seed: SEED,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: MAX_DAYS,
      pathfinder: await makePathfinder(),
      ...WORLD_SEED_OPT,
    });

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
