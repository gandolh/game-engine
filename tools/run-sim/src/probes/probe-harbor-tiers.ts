
import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import { ONT_HARBOR, type ContractCommittedBody, type ContractPostedBody } from "@farm/sim-core/protocols/harbor";
import type { GameEntity } from "@farm/sim-core/components";
import { makePathfinder } from "../pathfinder";

// Chunk D evidence probe (tiered harbor contracts).
//
// 1200 t/d is the sim's REAL default day length — probing at a low tick rate
// under-reports travel-gated actions (documented methodology trap, see
// probe-skill-diverge.ts). Run with PATHFINDER=wasm so travel to the harbor
// region is route-equivalent to the live sim.
const SEEDS = [0xc0ffee, 1, 42];
const TICKS_PER_DAY = 1200;
const MAX_DAYS = 100;

interface CommitEvent {
  day: number;
  farmerId: number;
  name: string;
  personality: string;
  tier: string;
  size: string;
  quantity: number;
  crop: string;
  reward: number;
}

async function runSeed(seed: number): Promise<void> {
  const { world, bus, scheduler } = bootstrapSim({
    seed,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: MAX_DAYS,
    pathfinder: await makePathfinder(),
  });

  const byId = new Map<number, GameEntity>();
  for (const f of world.query("farmer", "personality")) {
    if (f.id !== undefined) byId.set(f.id, f);
  }

  const events: CommitEvent[] = [];
  // Persistent id->contract map built from CONTRACT_POSTED — the live board's
  // openContracts array can no longer contain a contract by the time our
  // (deliberately one-tick-delayed, matching the sim host's notifySubscribers
  // pattern) COMMITTED handler runs: an immediate-fulfillment commit (farmer
  // already holds the goods) can deliver in the very same tick, which removes
  // the contract from openContracts before we look it up. Keeping our own
  // never-pruned map sidesteps that race entirely.
  const seenContracts = new Map<string, { tier: string; size: string; quantity: number; crop: string; reward: number }>();
  bus.subscribeOntology(ONT_HARBOR.CONTRACT_POSTED, (msg) => {
    const body = msg.body as unknown as ContractPostedBody;
    const c = body.contract;
    seenContracts.set(c.id, {
      tier: c.tier,
      size: (c as unknown as { size?: string }).size ?? "?",
      quantity: c.goods.quantity,
      crop: c.goods.crop,
      reward: c.reward,
    });
  });

  bus.subscribeOntology(ONT_HARBOR.CONTRACT_COMMITTED, (msg) => {
    const body = msg.body as unknown as ContractCommittedBody;
    const f = byId.get(body.farmerId);
    const meta = seenContracts.get(body.contractId);
    events.push({
      day: Math.floor(msg.tickIssued / TICKS_PER_DAY),
      farmerId: body.farmerId,
      name: body.farmerName,
      personality: f?.personality?.kind ?? "?",
      tier: meta?.tier ?? "?",
      size: meta?.size ?? "?",
      quantity: meta?.quantity ?? -1,
      crop: meta?.crop ?? "?",
      reward: meta?.reward ?? -1,
    });
  });

  // hoarder gold trajectory — sampled once per day for every hoarder farmer.
  const hoarderIds: number[] = [];
  for (const f of world.query("farmer", "personality")) {
    if (f.personality?.kind === "hoarder" && f.id !== undefined) hoarderIds.push(f.id);
  }
  const hoarderTrajectory: Record<number, number[]> = {};
  for (const id of hoarderIds) hoarderTrajectory[id] = [];
  let lastSampledDay = -1;

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    bus.notifySubscribers();
    const day = Math.floor(tick / TICKS_PER_DAY);
    if (day !== lastSampledDay && day % 10 === 0) {
      lastSampledDay = day;
      for (const id of hoarderIds) {
        const f = byId.get(id);
        hoarderTrajectory[id]!.push(f?.inventory?.gold ?? 0);
      }
    }
  }

  console.log(`\n================= SEED 0x${seed.toString(16)} =================`);
  console.log(`  commits: ${events.length}`);
  const byPersonality = new Map<string, CommitEvent[]>();
  for (const e of events) {
    const arr = byPersonality.get(e.personality) ?? [];
    arr.push(e);
    byPersonality.set(e.personality, arr);
  }
  for (const [personality, arr] of byPersonality) {
    console.log(`  --- ${personality}: ${arr.length} commit(s)`);
    for (const e of arr) {
      console.log(
        `      day ${e.day} ${e.name} tier=${e.tier} size=${e.size} ${e.quantity}x${e.crop} reward=${e.reward}g`,
      );
    }
  }
  const nonHoarderPersonalities = new Set(
    [...byPersonality.keys()].filter((p) => p !== "hoarder"),
  );
  console.log(`  --- distinct NON-hoarder personalities that committed: ${nonHoarderPersonalities.size} (${[...nonHoarderPersonalities].join(", ") || "none"})`);

  const board = leaderboard(world);
  console.log(`  --- hoarder gold trajectory (sampled every 10 days):`);
  for (const id of hoarderIds) {
    const row = board.find((r) => r.id === id);
    console.log(`      ${row?.name ?? id}: [${hoarderTrajectory[id]!.join(", ")}] final gold=${row?.gold}`);
  }
}

for (const s of SEEDS) await runSeed(s);
