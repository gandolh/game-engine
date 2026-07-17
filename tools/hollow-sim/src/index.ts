/**
 * Hollow headless sim runner (chunk hollow-01 scaffolding).
 *
 * Drives `bootstrapHollowSim()` directly on the main thread — no Worker, no
 * DOM, no server — mirroring `tools/run-sim`'s (Farm) and
 * `tools/citadel-sim`'s headless entry points. The scheduler has an EMPTY
 * system list for now (see @hollow/sim-core/sim-bootstrap); this just proves
 * the tick loop runs deterministically and exits cleanly, so later Hollow
 * briefs have a headless entry point to build real scenarios on top of.
 *
 * Usage:
 *   npm run sim:hollow
 *   SEED=0xdeadbeef MAX_DAYS=5 npm run sim:hollow
 */
import { bootstrapHollowSim } from "@hollow/sim-core/sim-bootstrap";

const SEED = process.env.SEED !== undefined ? Number(process.env.SEED) : 0x1a1100;
const TICKS_PER_DAY = process.env.TICKS_PER_DAY !== undefined ? Number(process.env.TICKS_PER_DAY) : 20;
const MAX_DAYS = process.env.MAX_DAYS !== undefined ? Number(process.env.MAX_DAYS) : 1;

function main(): void {
  console.log(
    `Hollow headless run — seed=0x${SEED.toString(16)}, ${MAX_DAYS} day(s) @ ${TICKS_PER_DAY} ticks/day`,
  );

  const sim = bootstrapHollowSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  for (let i = 0; i < totalTicks; i++) {
    sim.tick();
  }

  console.log(`Hollow: ${sim.getSnapshot().tick} tick(s) run — empty scaffolding, no gameplay yet.`);
  process.exit(0);
}

main();
