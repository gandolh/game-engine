/**
 * probe-59.ts — brief 59 P0 premise check.
 *
 * Confirms the TWO premises the balance/peer brief rests on, against the
 * CURRENT (post-55–58-split, post-2026-06-09-radial-reorg) code, before any
 * design work:
 *
 *   (A) the peer-interaction layer is inert — count every encounter-protocol
 *       message pushed to any farmer inbox (MEET / OFFER_SEED / OFFER_BEAN /
 *       ACCEPT / DECLINE) over a full 100-day run, plus how many farmers end
 *       with a non-empty `trust` map (lazy-initialized only by a trust delta,
 *       which only a peer/market event produces).
 *   (B) the leader runs away — final net-worth spread (leader÷2nd, leader÷last)
 *       and whether the wealth leader ever changes after day 20 (a "crossing").
 *
 * Pathfinder: WASM by default (matches the browser worker + Node WS server +
 * the determinism baseline). The JS and WASM pathfinders are NOT
 * route-equivalent, so the brief's numbers must come from the same one the
 * determinism check re-verifies against. Set PATHFINDER=js to compare.
 *
 * Message counting works by wrapping each farmer inbox's `messages.push` with a
 * counter — this catches OFFER_SEED even though EncounterTradeSystem splices it
 * back out within the same tick.
 *
 * Run: PATHFINDER=wasm npx tsx tools/run-sim/src/probe-59.ts
 */
import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import type { GameEntity } from "@farm/sim-core/components";
import {
  ONT_ENCOUNTER,
} from "@farm/sim-core/protocols/encounter";
import type { AgentMessage } from "@engine/core";
import { makePathfinder } from "./pathfinder";

const SEEDS = [0xc0ffee, 1, 42];
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

const ENCOUNTER_ONTS: Record<string, true> = {
  [ONT_ENCOUNTER.MEET]: true,
  [ONT_ENCOUNTER.OFFER_SEED]: true,
  [ONT_ENCOUNTER.OFFER_CROP]: true,
  [ONT_ENCOUNTER.OFFER_BEAN]: true,
  [ONT_ENCOUNTER.ACCEPT]: true,
  [ONT_ENCOUNTER.DECLINE]: true,
};

interface SeedResult {
  seed: number;
  counts: Record<string, number>;
  trustNonEmpty: number;
  trustEntries: number;
  declineReasons: Array<[string, number]>;
  offerShapes: string[];
  leaderName: string;
  standings: Array<{ name: string; personality: string; total: number }>;
  leaderDivBySecond: number;
  leaderDivByLast: number;
  crossingAfterDay20: boolean;
  leaderByDayTail: Array<{ day: number; name: string }>;
}

async function runSeed(seed: number): Promise<SeedResult> {
  const pathfinder = await makePathfinder();
  const { world, scheduler, dayClock } = bootstrapSim({
    seed,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: MAX_DAYS,
    pathfinder,
  });

  const counts: Record<string, number> = {
    [ONT_ENCOUNTER.MEET]: 0,
    [ONT_ENCOUNTER.OFFER_SEED]: 0,
    [ONT_ENCOUNTER.OFFER_CROP]: 0,
    [ONT_ENCOUNTER.OFFER_BEAN]: 0,
    [ONT_ENCOUNTER.ACCEPT]: 0,
    [ONT_ENCOUNTER.DECLINE]: 0,
  };
  const declineReasons = new Map<string, number>();
  const offerShapes = new Set<string>();

  // Wrap each farmer inbox's push to count encounter-protocol messages.
  for (const f of world.query("farmer", "inbox")) {
    const arr = f.inbox!.messages;
    const origPush = arr.push.bind(arr);
    (arr as unknown as { push: (...m: AgentMessage[]) => number }).push = (
      ...msgs: AgentMessage[]
    ) => {
      for (const m of msgs) {
        if (m && ENCOUNTER_ONTS[m.ontology]) {
          counts[m.ontology] = (counts[m.ontology] ?? 0) + 1;
          if (m.ontology === ONT_ENCOUNTER.DECLINE) {
            const reason = (m.body as { reason?: string }).reason ?? "?";
            declineReasons.set(reason, (declineReasons.get(reason) ?? 0) + 1);
          }
          if (m.ontology === ONT_ENCOUNTER.OFFER_SEED || m.ontology === ONT_ENCOUNTER.OFFER_CROP) {
            const kind = m.ontology === ONT_ENCOUNTER.OFFER_CROP ? "crop" : "seed";
            const b = m.body as { crop?: string; unitPrice?: number; direction?: string };
            offerShapes.add(`${kind}/${b.direction}:${b.crop}@${b.unitPrice}`);
          }
        }
      }
      return origPush(...msgs);
    };
  }

  // Track wealth leader per day for crossing detection.
  const leaderByDay: Array<{ day: number; name: string }> = [];
  let lastDay = -1;

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    if (dayClock.day !== lastDay) {
      lastDay = dayClock.day;
      const board = leaderboard(world).filter((r) => !isPlayer(world, r.id));
      if (board.length > 0) {
        leaderByDay.push({ day: dayClock.day, name: board[0]!.name });
      }
    }
  }

  // Final standings (AI only).
  const finalBoard = leaderboard(world)
    .filter((r) => !isPlayer(world, r.id))
    .map((r) => ({ name: r.name, personality: r.personality, total: Math.round(r.totalValue) }));

  // Trust maps.
  let trustNonEmpty = 0;
  let trustEntries = 0;
  for (const f of world.query("farmer")) {
    const m = f.trust?.byId;
    if (m && m.size > 0) {
      trustNonEmpty++;
      trustEntries += m.size;
    }
  }

  const leaderTotal = finalBoard[0]?.total ?? 0;
  const secondTotal = finalBoard[1]?.total ?? 0;
  const lastTotal = finalBoard[finalBoard.length - 1]?.total ?? 0;

  // Crossing: leader name changes at any day >= 20.
  let crossingAfterDay20 = false;
  const tail20 = leaderByDay.filter((d) => d.day >= 20);
  for (let i = 1; i < tail20.length; i++) {
    if (tail20[i]!.name !== tail20[i - 1]!.name) {
      crossingAfterDay20 = true;
      break;
    }
  }

  return {
    seed,
    counts,
    trustNonEmpty,
    trustEntries,
    declineReasons: [...declineReasons.entries()],
    offerShapes: [...offerShapes],
    leaderName: finalBoard[0]?.name ?? "?",
    standings: finalBoard,
    leaderDivBySecond: secondTotal > 0 ? leaderTotal / secondTotal : Infinity,
    leaderDivByLast: lastTotal > 0 ? leaderTotal / lastTotal : Infinity,
    crossingAfterDay20,
    leaderByDayTail: leaderByDay.slice(-10),
  };
}

function isPlayer(world: ReturnType<typeof bootstrapSim>["world"], id: number): boolean {
  for (const f of world.query("farmer")) {
    if (f.id === id) return !!f.player;
  }
  return false;
}

async function main(): Promise<void> {
  const pf = (process.env["PATHFINDER"] ?? "js").toLowerCase();
  console.log(`\n=== BRIEF 59 P0 PREMISE CHECK (pathfinder=${pf}, ${MAX_DAYS}d, ticksPerDay=${TICKS_PER_DAY}) ===`);

  const results: SeedResult[] = [];
  for (const seed of SEEDS) {
    results.push(await runSeed(seed));
  }

  console.log("\n--- (A) PEER-INTERACTION LAYER ---");
  for (const r of results) {
    const c = r.counts;
    const total =
      (c[ONT_ENCOUNTER.MEET] ?? 0) +
      (c[ONT_ENCOUNTER.OFFER_SEED] ?? 0) +
      (c[ONT_ENCOUNTER.OFFER_CROP] ?? 0) +
      (c[ONT_ENCOUNTER.OFFER_BEAN] ?? 0) +
      (c[ONT_ENCOUNTER.ACCEPT] ?? 0) +
      (c[ONT_ENCOUNTER.DECLINE] ?? 0);
    console.log(`  seed 0x${r.seed.toString(16)}:`);
    console.log(
      `    MEET=${c[ONT_ENCOUNTER.MEET]}  OFFER_SEED=${c[ONT_ENCOUNTER.OFFER_SEED]}  OFFER_CROP=${c[ONT_ENCOUNTER.OFFER_CROP]}  OFFER_BEAN=${c[ONT_ENCOUNTER.OFFER_BEAN]}  ACCEPT=${c[ONT_ENCOUNTER.ACCEPT]}  DECLINE=${c[ONT_ENCOUNTER.DECLINE]}  (Σ=${total})`,
    );
    console.log(
      `    farmers with non-empty trust map: ${r.trustNonEmpty}  (total trust entries: ${r.trustEntries})`,
    );
    console.log(`    offer shapes seen: ${r.offerShapes.join(", ") || "(none)"}`);
    console.log(
      `    decline reasons: ${r.declineReasons.map(([k, v]) => `${k}×${v}`).join(", ") || "(none)"}`,
    );
  }
  const anyOffer = results.some(
    (r) =>
      (r.counts[ONT_ENCOUNTER.OFFER_SEED] ?? 0) > 0 ||
      (r.counts[ONT_ENCOUNTER.OFFER_CROP] ?? 0) > 0 ||
      (r.counts[ONT_ENCOUNTER.OFFER_BEAN] ?? 0) > 0,
  );
  const anyAccept = results.some((r) => (r.counts[ONT_ENCOUNTER.ACCEPT] ?? 0) > 0);
  const anyTrust = results.some((r) => r.trustNonEmpty > 0);
  console.log(
    `  => offers fire: ${anyOffer ? "YES" : "no"} | trades close (ACCEPT>0): ${anyAccept ? "YES ✓" : "NO ✗"} | trust deltas land: ${anyTrust ? "YES ✓" : "NO ✗"}`,
  );

  console.log("\n--- (B) LEADER RUNAWAY ---");
  for (const r of results) {
    console.log(`  seed 0x${r.seed.toString(16)}:  leader=${r.leaderName}`);
    for (const s of r.standings) {
      console.log(`      ${s.name.padEnd(9)} ${s.personality.padEnd(12)} total=${s.total}`);
    }
    console.log(
      `      leader÷2nd=${r.leaderDivBySecond.toFixed(2)}  leader÷last=${r.leaderDivByLast.toFixed(2)}  crossing(after d20)=${r.crossingAfterDay20 ? "YES" : "NO"}`,
    );
    console.log(`      leader by day (tail): ${r.leaderByDayTail.map((d) => `d${d.day}:${d.name}`).join(" ")}`);
  }
  const anyCrossing = results.some((r) => r.crossingAfterDay20);
  console.log(
    `  => RUNAWAY ${anyCrossing ? "DENTED on ≥1 seed (some crossing already)" : "CONFIRMED (no post-day-20 crossing on any seed)"}`,
  );

  console.log("\n=== SUMMARY ===");
  console.log(`  Premise A (peer inert):    ${anyOffer || anyTrust ? "FALSIFIED" : "HOLDS"}`);
  console.log(`  Premise B (leader runaway): ${anyCrossing ? "WEAKER than wiki (crossings exist)" : "HOLDS"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
