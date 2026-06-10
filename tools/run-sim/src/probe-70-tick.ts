/**
 * probe-70-tick.ts — ultra-targeted: sample Hannah's wheat inventory at exact ticks
 * around the MEET events (d18: tick 360-379, d19: tick 380-399).
 */
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { makePathfinder } from "./pathfinder";

async function main(): Promise<void> {
  const pathfinder = await makePathfinder();
  const { world, scheduler } = bootstrapSim({
    seed: 0xc0ffee,
    ticksPerDay: 20,
    maxDays: 20,
    pathfinder,
  });

  const totalTicks = 20 * 20;
  for (let tick = 0; tick < totalTicks; tick++) {
    // Sample BEFORE running the tick (so we see the state at the START of each tick)
    if (tick >= 355 && tick <= 400) {
      for (const f of world.query("farmer", "inventory")) {
        if (f.player) continue;
        if (f.farmer?.name !== "Hannah" && f.farmer?.name !== "Atticus-9") continue;
        const k = f.personality?.kind ?? "?";
        const wheat = f.inventory!.crops["wheat"];
        const gold = f.inventory!.gold;
        const minR = (f.desires?.data["minGoldReserve"] as number | undefined) ?? 0;
        console.log(
          `  [tick=${tick} start] ${(f.farmer?.name ?? "?").padEnd(10)} (${k}) wheat=${wheat} gold=${gold} minR=${minR} slack=${gold-minR}`,
        );
      }
    }
    scheduler.tick({ tick });
    // Sample AFTER
    if (tick >= 355 && tick <= 400) {
      for (const f of world.query("farmer", "inventory")) {
        if (f.player) continue;
        if (f.farmer?.name !== "Hannah" && f.farmer?.name !== "Atticus-9") continue;
        const k = f.personality?.kind ?? "?";
        const wheat = f.inventory!.crops["wheat"];
        const gold = f.inventory!.gold;
        const minR = (f.desires?.data["minGoldReserve"] as number | undefined) ?? 0;
        console.log(
          `  [tick=${tick}  end] ${(f.farmer?.name ?? "?").padEnd(10)} (${k}) wheat=${wheat} gold=${gold} minR=${minR} slack=${gold-minR}`,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
