/**
 * Citadel headless sim runner.
 *
 * Drives bootstrapSim() directly on the main thread — no Worker.
 * Same deterministic loop as the browser Worker, just without the setInterval.
 *
 * Usage:
 *   npm run sim:citadel
 *   SEED=0xdeadbeef MAX_DAYS=10 npm run sim:citadel
 */
import { bootstrapSim } from "@citadel/sim-core/sim-bootstrap";

const SEED = parseInt(process.env.SEED ?? "0x1a2b3c4d", 16) >>> 0;
const MAX_DAYS = parseInt(process.env.MAX_DAYS ?? "10", 10);
const TICKS_PER_DAY = parseInt(process.env.TICKS_PER_DAY ?? "20", 10);

function main(): void {
  console.log(
    `Citadel headless sim — seed=0x${SEED.toString(16)}, ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day`,
  );

  const { scheduler, dayClock, terrain } = bootstrapSim({
    seed: SEED,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: MAX_DAYS,
  });

  console.log(`Terrain generated: ${terrain.width}×${terrain.height} tiles`);

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  let lastDay = -1;

  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    if (dayClock.day !== lastDay) {
      console.log(`  Day ${dayClock.day + 1} / ${MAX_DAYS}`);
      lastDay = dayClock.day;
    }
  }

  console.log(`\nDone. Simulated ${totalTicks} ticks (${MAX_DAYS} days).`);
  process.exit(0);
}

main();
