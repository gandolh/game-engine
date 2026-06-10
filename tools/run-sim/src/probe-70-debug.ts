/**
 * probe-70-debug.ts — Verify whether OFFER_CROP is firing on seed 0xc0ffee.
 * Rather than wrapping push, directly check inventory + trust changes.
 */
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { ONT_ENCOUNTER } from "@farm/sim-core/protocols/encounter";
import type { AgentMessage } from "@engine/core";
import { makePathfinder } from "./pathfinder";

async function main(): Promise<void> {
  const pathfinder = await makePathfinder();
  const { world, scheduler, dayClock } = bootstrapSim({
    seed: 0xc0ffee,
    ticksPerDay: 20,
    maxDays: 20,
    pathfinder,
  });

  // Record start state for hoarders and buyers
  console.log("=== START STATE ===");
  for (const f of world.query("farmer", "inventory")) {
    if (f.player) continue;
    const k = f.personality?.kind ?? "?";
    if (k === "hoarder" || k === "opportunist" || k === "aggressive") {
      const gold = f.inventory!.gold;
      const minR = (f.desires?.data["minGoldReserve"] as number | undefined) ?? 0;
      const wheat = f.inventory!.crops["wheat"];
      console.log(`  ${(f.farmer?.name ?? "?").padEnd(10)} (${k.padEnd(12)}) gold=${gold} minR=${minR} slack=${gold - minR} wheat=${wheat}`);
    }
  }

  // Use a different approach: capture trust changes (only happen on accepted trades)
  // and track wheat inventory changes
  const startWheat = new Map<number, number>();
  const startGold = new Map<number, number>();
  for (const f of world.query("farmer", "inventory")) {
    if (f.id !== undefined && !f.player) {
      startWheat.set(f.id, f.inventory!.crops["wheat"]);
      startGold.set(f.id, f.inventory!.gold);
    }
  }

  // Also: count ALL messages via a simple counter approach
  let meetCount = 0;
  let offerCropCount = 0;
  let acceptCount = 0;
  let declineCount = 0;
  const declineReasons = new Map<string, number>();

  for (const f of world.query("farmer", "inbox")) {
    const arr = f.inbox!.messages;
    const origPush = arr.push.bind(arr);
    // eslint-disable-next-line no-inner-declarations
    const wrapped = (...msgs: AgentMessage[]): number => {
      for (const m of msgs) {
        if (!m) continue;
        if (m.ontology === ONT_ENCOUNTER.MEET) meetCount++;
        else if (m.ontology === ONT_ENCOUNTER.OFFER_CROP) {
          offerCropCount++;
          console.log(`  OFFER_CROP pushed to farmer id=${f.id} (${f.personality?.kind}) at tick offset`);
        } else if (m.ontology === ONT_ENCOUNTER.ACCEPT) acceptCount++;
        else if (m.ontology === ONT_ENCOUNTER.DECLINE) {
          declineCount++;
          const r = (m.body as { reason?: string }).reason ?? "?";
          declineReasons.set(r, (declineReasons.get(r) ?? 0) + 1);
        }
      }
      return origPush(...msgs);
    };
    arr.push = wrapped as typeof arr.push;
  }

  const totalTicks = 20 * 20;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
  }

  console.log(`\n=== MESSAGE COUNTS ===`);
  console.log(`  MEET: ${meetCount}`);
  console.log(`  OFFER_CROP: ${offerCropCount}`);
  console.log(`  ACCEPT: ${acceptCount}`);
  console.log(`  DECLINE: ${declineCount}`);
  console.log(`  Decline reasons: ${[...declineReasons.entries()].map(([k, v]) => `${k}×${v}`).join(", ")}`);

  console.log("\n=== INVENTORY CHANGES (wheat/gold, d0→d20) ===");
  for (const f of world.query("farmer", "inventory")) {
    if (f.id === undefined || f.player) continue;
    const k = f.personality?.kind ?? "?";
    if (k !== "hoarder" && k !== "opportunist" && k !== "aggressive") continue;
    const wheatStart = startWheat.get(f.id) ?? 0;
    const goldStart = startGold.get(f.id) ?? 0;
    const wheatEnd = f.inventory!.crops["wheat"];
    const goldEnd = f.inventory!.gold;
    const trust = f.trust?.byId;
    console.log(
      `  ${(f.farmer?.name ?? "?").padEnd(10)} (${k.padEnd(12)}) gold: ${goldStart}→${goldEnd} (+${goldEnd - goldStart})  wheat: ${wheatStart}→${wheatEnd} (${wheatEnd - wheatStart})  trust_entries=${trust?.size ?? 0}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
