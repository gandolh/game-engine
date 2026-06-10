/**
 * probe-70-wraptest.ts — verify the push-wrapper technique works,
 * and directly test if OFFER_CROP fires by checking inventory changes.
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

  // Test 1: verify wrapper fires for a MANUAL push
  let testCounter = 0;
  const allWrapped = new Map<number, string>();

  for (const f of world.query("farmer", "inbox")) {
    const arr = f.inbox!.messages;
    const fId = f.id!;
    const fName = f.farmer?.name ?? "?";
    const origPush = arr.push.bind(arr);
    const wrapped = (...msgs: AgentMessage[]): number => {
      for (const m of msgs) {
        if (!m) continue;
        if (m.ontology === ONT_ENCOUNTER.OFFER_CROP) {
          testCounter++;
          console.log(`  [WRAP] OFFER_CROP pushed to id=${fId} (${fName}) at day=${dayClock.day}`);
        }
      }
      return origPush(...msgs);
    };
    arr.push = wrapped as typeof arr.push;
    allWrapped.set(fId, fName);
  }

  console.log(`Wrapped ${allWrapped.size} farmer inboxes`);

  // Manually push a test OFFER_CROP to verify wrapper fires
  for (const f of world.query("farmer", "inbox")) {
    if (f.farmer?.name === "Atticus-9") {
      console.log(`\nManual OFFER_CROP push to Atticus-9 (id=${f.id}) - testing wrapper...`);
      f.inbox!.messages.push({
        performative: "propose",
        ontology: ONT_ENCOUNTER.OFFER_CROP,
        sender: 2, // Hannah's id
        body: { offerId: "test-1", crop: "wheat", quantity: 2, unitPrice: 7.6, direction: "sell" } as Record<string, unknown>,
        tickIssued: 0,
      });
      console.log(`  testCounter after manual push: ${testCounter}`);
      // Remove the test message
      f.inbox!.messages.splice(f.inbox!.messages.length - 1, 1);
      break;
    }
  }

  console.log(`\n=== RUNNING SIMULATION ===`);
  const totalTicks = 20 * 20;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
  }

  console.log(`\nFinal OFFER_CROP count: ${testCounter}`);

  // Check if any wheat transferred between Hannah and Atticus-9
  for (const f of world.query("farmer", "inventory")) {
    if (f.player) continue;
    if (f.farmer?.name === "Hannah" || f.farmer?.name === "Atticus-9") {
      console.log(`  ${f.farmer.name}: gold=${f.inventory!.gold} wheat=${f.inventory!.crops.wheat} trust_entries=${f.trust?.byId.size ?? 0}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
