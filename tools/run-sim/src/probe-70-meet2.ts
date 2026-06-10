/**
 * probe-70-meet2.ts — who is meeting whom on seed 0xc0ffee?
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

  // Build id→name map
  const nameById = new Map<number, string>();
  const kindById = new Map<number, string>();
  for (const f of world.query("farmer")) {
    if (f.id !== undefined) {
      nameById.set(f.id, f.farmer?.name ?? "?");
      kindById.set(f.id, f.personality?.kind ?? "?");
    }
  }

  const meets: Array<{ day: number; from: number; to: number }> = [];
  const declines: Array<{ day: number; reason: string; toId: number }> = [];

  // Wrap each farmer inbox's push to track meets
  for (const f of world.query("farmer", "inbox")) {
    const fId = f.id;
    if (fId === undefined) continue;
    const arr = f.inbox!.messages;
    const origPush = arr.push.bind(arr);
    (arr as unknown as { push: (...m: AgentMessage[]) => number }).push = (
      ...msgs: AgentMessage[]
    ) => {
      for (const m of msgs) {
        if (!m) continue;
        const day = dayClock.day;
        if (m.ontology === ONT_ENCOUNTER.MEET) {
          meets.push({ day, from: typeof m.sender === "number" ? m.sender : -1, to: fId });
        } else if (m.ontology === ONT_ENCOUNTER.DECLINE) {
          const reason = (m.body as { reason?: string }).reason ?? "?";
          declines.push({ day, reason, toId: fId });
        }
      }
      return origPush(...msgs);
    };
  }

  const totalTicks = 20 * 20;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
  }

  console.log("=== MEET EVENTS ===");
  for (const m of meets) {
    const fromName = nameById.get(m.from) ?? "?";
    const toName = nameById.get(m.to) ?? "?";
    const fromKind = kindById.get(m.from) ?? "?";
    const toKind = kindById.get(m.to) ?? "?";
    console.log(`  d${m.day}: ${fromName}(${fromKind}) -> ${toName}(${toKind})`);
  }

  console.log("\n=== DECLINE EVENTS ===");
  for (const d of declines) {
    const toName = nameById.get(d.toId) ?? "?";
    console.log(`  d${d.day}: reason=${d.reason} to=${toName}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
