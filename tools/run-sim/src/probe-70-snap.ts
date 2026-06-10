/**
 * probe-70-snap.ts — snapshot-based detection of peer crop trades.
 * Compares Hannah and Atticus-9 wheat/gold BEFORE and AFTER each tick
 * to detect if a peer transfer happened.
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

  // Find Hannah and Atticus-9
  type FE = ReturnType<typeof bootstrapSim>["world"] extends { query: (...args: unknown[]) => Iterable<infer E> } ? E : never;
  let hannahEnt: FE | null = null;
  let atticus9Ent: FE | null = null;

  for (const f of world.query("farmer", "inventory")) {
    if ((f as { farmer?: { name?: string } }).farmer?.name === "Hannah") hannahEnt = f as FE;
    if ((f as { farmer?: { name?: string } }).farmer?.name === "Atticus-9") atticus9Ent = f as FE;
  }

  if (!hannahEnt || !atticus9Ent) {
    console.error("Could not find Hannah or Atticus-9");
    return;
  }

  const totalTicks = 20 * 20;
  for (let tick = 0; tick < totalTicks; tick++) {
    const hWheatBefore = (hannahEnt as { inventory: { crops: { wheat: number } } }).inventory.crops.wheat;
    const aGoldBefore = (atticus9Ent as { inventory: { gold: number } } ).inventory.gold;
    const aWheatBefore = (atticus9Ent as { inventory: { crops: { wheat: number } } }).inventory.crops.wheat;

    scheduler.tick({ tick });

    const hWheatAfter = (hannahEnt as { inventory: { crops: { wheat: number } } }).inventory.crops.wheat;
    const aGoldAfter = (atticus9Ent as { inventory: { gold: number } }).inventory.gold;
    const aWheatAfter = (atticus9Ent as { inventory: { crops: { wheat: number } } }).inventory.crops.wheat;

    // Check for wheat transfer: Atticus-9 gained wheat AND Hannah lost wheat
    if (aWheatAfter > aWheatBefore && hWheatAfter < hWheatBefore) {
      console.log(`PEER CROP TRADE DETECTED at tick=${tick} day=${dayClock.day}`);
      console.log(`  Hannah: wheat ${hWheatBefore}→${hWheatAfter}`);
      console.log(`  Atticus-9: wheat ${aWheatBefore}→${aWheatAfter}, gold ${aGoldBefore}→${aGoldAfter}`);
    }
    // Check for seed transfer (Hannah buying radish seeds)
    // Could also check reverse (Hannah gaining gold from Atticus-9)
  }

  console.log("\n=== FINAL STATE ===");
  console.log(`  Hannah: wheat=${(hannahEnt as { inventory: { crops: { wheat: number } } }).inventory.crops.wheat} gold=${(hannahEnt as { inventory: { gold: number } }).inventory.gold}`);
  console.log(`  Atticus-9: wheat=${(atticus9Ent as { inventory: { crops: { wheat: number } } }).inventory.crops.wheat} gold=${(atticus9Ent as { inventory: { gold: number } }).inventory.gold}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
