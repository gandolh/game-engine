/**
 * probe-70-wheat.ts — diagnostic: wheat accumulation + buyer gold on seed 0xc0ffee
 * to understand why the early-game closes 0 on 0xc0ffee (brief 70).
 */
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { makePathfinder } from "./pathfinder";

async function main(): Promise<void> {
  const pathfinder = await makePathfinder();
  const { world, scheduler, dayClock } = bootstrapSim({
    seed: 0xc0ffee,
    ticksPerDay: 20,
    maxDays: 20,
    pathfinder,
  });

  let lastDay = -1;
  const totalTicks = 20 * 20;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    if (dayClock.day !== lastDay) {
      lastDay = dayClock.day;
      for (const f of world.query("farmer", "inventory")) {
        if (f.player) continue;
        const kind = f.personality?.kind ?? "?";
        const wheat = f.inventory!.crops["wheat"];
        const gold = f.inventory!.gold;
        const minR = (f.desires?.data["minGoldReserve"] as number | undefined) ?? 0;
        if (wheat > 0 || kind === "hoarder") {
          console.log(
            `  d${String(dayClock.day).padStart(2)} ${(f.farmer?.name ?? "?").padEnd(10)} (${kind.padEnd(12)}) wheat_crops=${wheat} gold=${gold} minReserve=${minR}`,
          );
        }
      }
    }
  }

  console.log("\n=== END OF RUN GOLD / WHEAT (all AI farmers) ===");
  for (const f of world.query("farmer", "inventory")) {
    if (f.player) continue;
    const kind = f.personality?.kind ?? "?";
    const wheat = f.inventory!.crops["wheat"];
    const gold = f.inventory!.gold;
    const minR = (f.desires?.data["minGoldReserve"] as number | undefined) ?? 0;
    const canBuy2wheat = gold - 2 * (8 * 0.95) >= minR;
    console.log(
      `  ${(f.farmer?.name ?? "?").padEnd(10)} (${kind.padEnd(12)}) gold=${gold} minR=${minR} canBuy2wheat(0.95shop)=${canBuy2wheat} wheat_crops=${wheat}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
