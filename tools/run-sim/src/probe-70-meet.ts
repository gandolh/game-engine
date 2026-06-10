/**
 * probe-70-meet.ts — diagnostic: count MEET events + OFFER_CROP on 0xc0ffee
 * to understand why 0 crop offers fire even though hoarders have wheat >= 6.
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

  let meetTotal = 0;
  let offerCropTotal = 0;
  let acceptTotal = 0;
  let declineTotal = 0;
  const declineReasons = new Map<string, number>();

  // Wrap each farmer inbox's push to count messages
  for (const f of world.query("farmer", "inbox")) {
    const arr = f.inbox!.messages;
    const origPush = arr.push.bind(arr);
    (arr as unknown as { push: (...m: AgentMessage[]) => number }).push = (
      ...msgs: AgentMessage[]
    ) => {
      for (const m of msgs) {
        if (!m) continue;
        if (m.ontology === ONT_ENCOUNTER.MEET) meetTotal++;
        else if (m.ontology === ONT_ENCOUNTER.OFFER_CROP) offerCropTotal++;
        else if (m.ontology === ONT_ENCOUNTER.ACCEPT) acceptTotal++;
        else if (m.ontology === ONT_ENCOUNTER.DECLINE) {
          declineTotal++;
          const reason = (m.body as { reason?: string }).reason ?? "?";
          declineReasons.set(reason, (declineReasons.get(reason) ?? 0) + 1);
        }
      }
      return origPush(...msgs);
    };
  }

  const totalTicks = 20 * 20;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
  }

  console.log("=== SEED 0xc0ffee MEET + OFFER_CROP COUNTS ===");
  console.log(`  MEET:       ${meetTotal}`);
  console.log(`  OFFER_CROP: ${offerCropTotal}`);
  console.log(`  ACCEPT:     ${acceptTotal}`);
  console.log(`  DECLINE:    ${declineTotal}`);
  console.log(`  Decline reasons: ${[...declineReasons.entries()].map(([k, v]) => `${k}×${v}`).join(", ")}`);

  console.log("\n=== HOARDER WHEAT AT END ===");
  for (const f of world.query("farmer", "inventory")) {
    if (f.player || f.personality?.kind !== "hoarder") continue;
    console.log(`  ${f.farmer?.name ?? "?"}: wheat=${f.inventory!.crops["wheat"]} gold=${f.inventory!.gold}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
