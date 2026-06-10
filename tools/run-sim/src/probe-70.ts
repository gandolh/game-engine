/**
 * probe-70.ts — brief 70 baseline + post-change probe.
 *
 * Counts peer OFFER_CROP events, ACCEPT (closes), and DECLINE reasons per
 * day-band (days 0-4, 5-9, 10-14, 15-19) for seed 0xc0ffee, then optionally
 * runs the two brief-59 working seeds (1 and 42) for regression checks.
 *
 * Used to:
 *   (A) Confirm the baseline: early-game (days 0-14) closes ~0, all
 *       would-breach-reserve declines on 0xc0ffee.
 *   (B) After the startGold bump: confirm ≥1 close in first 15 days on
 *       0xc0ffee, and no regression on seeds 1 & 42.
 *
 * Run: PATHFINDER=wasm npx tsx tools/run-sim/src/probe-70.ts
 * Limit: MAX_DAYS=20 TICKS_PER_DAY=20 (hard constraint, constrained hardware)
 */
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import {
  ONT_ENCOUNTER,
} from "@farm/sim-core/protocols/encounter";
import type { AgentMessage } from "@engine/core";
import { makePathfinder } from "./pathfinder";

const TICKS_PER_DAY = 20;
const MAX_DAYS = 20;
// Day bands: [0..4], [5..9], [10..14], [15..19]
const BANDS = [
  { label: "d00-04", from: 0,  to: 4  },
  { label: "d05-09", from: 5,  to: 9  },
  { label: "d10-14", from: 10, to: 14 },
  { label: "d15-19", from: 15, to: 19 },
];

interface BandStats {
  label: string;
  offers: number;
  closes: number;
  declines: Map<string, number>;
}

interface SeedResult {
  seed: number;
  bands: BandStats[];
  totalOffers: number;
  totalCloses: number;
  totalDeclines: number;
  allDeclineReasons: Array<[string, number]>;
  firstCloseDay: number | null;
}

async function runSeed(seed: number): Promise<SeedResult> {
  const pathfinder = await makePathfinder();
  const { world, scheduler, dayClock } = bootstrapSim({
    seed,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: MAX_DAYS,
    pathfinder,
  });

  // Initialize band stats
  const bands: BandStats[] = BANDS.map((b) => ({
    label: b.label,
    offers: 0,
    closes: 0,
    declines: new Map<string, number>(),
  }));

  let firstCloseDay: number | null = null;

  // Wrap each farmer inbox's push to count encounter messages per day-band.
  for (const f of world.query("farmer", "inbox")) {
    const arr = f.inbox!.messages;
    const origPush = arr.push.bind(arr);
    (arr as unknown as { push: (...m: AgentMessage[]) => number }).push = (
      ...msgs: AgentMessage[]
    ) => {
      for (const m of msgs) {
        if (!m) continue;
        const day = dayClock.day;
        const bandIdx = BANDS.findIndex((b) => day >= b.from && day <= b.to);
        if (bandIdx < 0) {
          return origPush(...msgs);
        }
        const band = bands[bandIdx]!;

        if (m.ontology === ONT_ENCOUNTER.OFFER_CROP) {
          band.offers++;
        } else if (m.ontology === ONT_ENCOUNTER.ACCEPT) {
          band.closes++;
          if (firstCloseDay === null) firstCloseDay = day;
        } else if (m.ontology === ONT_ENCOUNTER.DECLINE) {
          const reason = (m.body as { reason?: string }).reason ?? "?";
          band.declines.set(reason, (band.declines.get(reason) ?? 0) + 1);
        }
      }
      return origPush(...msgs);
    };
  }

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
  }

  // Aggregate totals
  let totalOffers = 0;
  let totalCloses = 0;
  let totalDeclines = 0;
  const allReasons = new Map<string, number>();
  for (const band of bands) {
    totalOffers += band.offers;
    totalCloses += band.closes;
    for (const [r, n] of band.declines) {
      totalDeclines += n;
      allReasons.set(r, (allReasons.get(r) ?? 0) + n);
    }
  }

  return {
    seed,
    bands,
    totalOffers,
    totalCloses,
    totalDeclines,
    allDeclineReasons: [...allReasons.entries()],
    firstCloseDay,
  };
}

function printSeedResult(r: SeedResult): void {
  console.log(`\n  seed 0x${r.seed.toString(16)}:`);
  console.log(
    `  ${"Band".padEnd(8)} ${"OFFER_CROP".padEnd(12)} ${"ACCEPT".padEnd(8)} ${"DECLINE".padEnd(10)} Decline reasons`,
  );
  for (const band of r.bands) {
    const totalBandDeclines = [...band.declines.values()].reduce((a, b) => a + b, 0);
    const reasons = [...band.declines.entries()]
      .map(([k, v]) => `${k}×${v}`)
      .join(" ");
    console.log(
      `  ${band.label.padEnd(8)} ${String(band.offers).padEnd(12)} ${String(band.closes).padEnd(8)} ${String(totalBandDeclines).padEnd(10)} ${reasons || "(none)"}`,
    );
  }
  console.log(
    `  TOTALS: offers=${r.totalOffers} closes=${r.totalCloses} declines=${r.totalDeclines}`,
  );
  console.log(
    `  First close day: ${r.firstCloseDay !== null ? `day ${r.firstCloseDay}` : "none"}`,
  );
  console.log(
    `  All decline reasons: ${r.allDeclineReasons.map(([k, v]) => `${k}×${v}`).join(", ") || "(none)"}`,
  );
}

async function main(): Promise<void> {
  const pf = (process.env["PATHFINDER"] ?? "js").toLowerCase();
  const seeds = [0xc0ffee, 1, 42];
  console.log(
    `\n=== BRIEF 70 PROBE (pathfinder=${pf}, ${MAX_DAYS}d, ticksPerDay=${TICKS_PER_DAY}) ===`,
  );
  console.log(`Seeds: ${seeds.map((s) => "0x" + s.toString(16)).join(", ")}`);

  const results: SeedResult[] = [];
  for (const seed of seeds) {
    process.stdout.write(`  Running seed 0x${seed.toString(16)}...`);
    const r = await runSeed(seed);
    results.push(r);
    process.stdout.write(
      ` done (${r.totalOffers} offers, ${r.totalCloses} closes)\n`,
    );
  }

  console.log("\n--- PEER CROP TRADE COUNTS BY DAY-BAND ---");
  for (const r of results) {
    printSeedResult(r);
  }

  console.log("\n--- SUMMARY ---");
  const coffeeResult = results.find((r) => r.seed === 0xc0ffee)!;
  const earlyCloses = coffeeResult.bands
    .filter((b) => BANDS.find((bb) => bb.label === b.label)!.to <= 14)
    .reduce((s, b) => s + b.closes, 0);
  console.log(`  0xc0ffee early-game (d00-14) closes: ${earlyCloses}`);
  const earlyBreachDeclines = coffeeResult.bands
    .filter((b) => BANDS.find((bb) => bb.label === b.label)!.to <= 14)
    .reduce(
      (s, b) => s + (b.declines.get("would-breach-reserve") ?? 0),
      0,
    );
  console.log(
    `  0xc0ffee early-game (d00-14) would-breach-reserve declines: ${earlyBreachDeclines}`,
  );
  for (const r of results) {
    const any15 = r.firstCloseDay !== null && r.firstCloseDay < 15;
    console.log(
      `  0x${r.seed.toString(16)}: first close = ${r.firstCloseDay !== null ? `day ${r.firstCloseDay}` : "none"}  early close (<15d): ${any15 ? "YES" : "NO"}`,
    );
  }
  const targetMet =
    coffeeResult.firstCloseDay !== null && coffeeResult.firstCloseDay < 15;
  console.log(
    `\n  TARGET (>=1 close in first 15 days on 0xc0ffee): ${targetMet ? "MET ✓" : "NOT MET ✗"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
