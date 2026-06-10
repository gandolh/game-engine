/**
 * probe-70-coral.ts — check when coral fishing fires with new +30 gold values.
 */
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import { isCoralReefTile } from "@farm/sim-core/world/coral";

async function main(): Promise<void> {
  const sim = bootstrapSim({
    seed: 0xc0ffee,
    ticksPerDay: 800,
    maxDays: 10,
    pathfinder: new JsPathfinder(),
    shock: false,
  });

  let aboardSeen = false;
  let reachedReef = false;
  let reachedReefTick = -1;

  for (let t = 0; t < 800 * 10; t++) {
    sim.scheduler.tick({ tick: t });
    sim.bus.notifySubscribers();
    const day = Math.floor(t / 800);
    for (const f of sim.farmers) {
      if (f.farmer?.aboard) {
        if (!aboardSeen) {
          console.log(`FIRST ABOARD: ${f.farmer.name} at tick=${t} day=${day}`);
          aboardSeen = true;
        }
        const tx = Math.round(f.transform?.x ?? -1);
        const ty = Math.round(f.transform?.y ?? -1);
        if (isCoralReefTile(tx, ty) && !reachedReef) {
          console.log(`REACHED REEF: ${f.farmer.name} at tick=${t} day=${day} (tx=${tx},ty=${ty})`);
          reachedReef = true;
          reachedReefTick = t;
        }
      }
    }
  }

  console.log(`\nFinal: aboardSeen=${aboardSeen} reachedReef=${reachedReef} at tick=${reachedReefTick}`);

  let coral = 0;
  for (const f of sim.farmers) {
    const fish = f.inventory?.fish;
    const ct = fish?.["coral-trout"] ?? 0;
    const lb = fish?.["lobster"] ?? 0;
    if (ct > 0 || lb > 0) {
      console.log(`  ${f.farmer?.name}: coral-trout=${ct} lobster=${lb}`);
    }
    coral += ct + lb;
  }
  console.log(`Total coral fish: ${coral}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
