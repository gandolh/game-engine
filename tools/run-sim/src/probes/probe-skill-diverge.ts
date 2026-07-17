
import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import { skillLevel } from "@farm/sim-core/systems/skills";
import { SKILL_KINDS, type GameEntity } from "@farm/sim-core/components";
import { makePathfinder } from "../pathfinder";

// 1200 = the sim's REAL default day length. Probing at a low tick rate (e.g. the
// 20 t/d probe-70 used) is the documented trap: farmers barely travel, so any
// travel-gated line (fishing excursions, forage zones) under-reports — see the
// 2026-07-16 starting-crop-surplus closeout for the methodology finding.
const SEEDS = [0xc0ffee, 1, 42];
const TICKS_PER_DAY = 1200;
const MAX_DAYS = 100;

type Axis = "farming" | "foraging" | "fishing" | "mining";

async function runSeed(seed: number): Promise<void> {
  // WASM pathfinder — the JS fallback is NOT route-equivalent (documented
  // gotcha) and cannot route some excursion targets, which starves the very
  // travel-gated lines this probe measures. Run with PATHFINDER=wasm.
  const { world, scheduler } = bootstrapSim({
    seed,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: MAX_DAYS,
    pathfinder: await makePathfinder(),
  });
  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  for (let tick = 0; tick < totalTicks; tick++) scheduler.tick({ tick });

  const board = leaderboard(world);
  const byId = new Map<number, GameEntity>();
  for (const f of world.query("farmer")) if (f.id !== undefined) byId.set(f.id, f);

  console.log(`\n================= SEED 0x${seed.toString(16)} =================`);
  // Per-farmer skill sheet + wealth, sorted by wealth desc.
  const rows = board
    .slice()
    .sort((a, b) => b.totalValue - a.totalValue);

  const nonFarmLeaders = new Set<string>();
  const dominantLineCounts: Record<string, number> = {};
  let rank = 0;
  const wealthDominanceTop5: Record<string, number> = {};
  for (const row of rows) {
    rank++;
    const f = byId.get(row.id);
    const sk = f?.skills ?? { farming: 0, foraging: 0, fishing: 0, mining: 0 };
    const levels: Record<Axis, number> = {
      farming: skillLevel(sk.farming),
      foraging: skillLevel(sk.foraging),
      fishing: skillLevel(sk.fishing),
      mining: skillLevel(sk.mining),
    };
    // dominant NON-farm line by xp
    const nonFarm: Axis[] = ["foraging", "fishing", "mining"];
    let topNon: Axis = "foraging";
    for (const a of nonFarm) if (sk[a] > sk[topNon]) topNon = a;
    const topNonLevel = levels[topNon];
    // A farmer "leans non-farm" if their best non-farm line reached >=L3 and
    // its xp is a meaningful fraction of their farming xp.
    const leansNonFarm = topNonLevel >= 3 && sk[topNon] >= 0.5 * sk.farming;
    if (leansNonFarm) {
      nonFarmLeaders.add(row.name);
      dominantLineCounts[topNon] = (dominantLineCounts[topNon] ?? 0) + 1;
      if (rank <= 5) wealthDominanceTop5[topNon] = (wealthDominanceTop5[topNon] ?? 0) + 1;
    }
    const skStr = SKILL_KINDS.map(
      (a) => `${a[0]!.toUpperCase()}${a[1]}${levels[a as Axis]}`,
    ).join(" ");
    console.log(
      `  #${String(rank).padStart(2)} ${row.name.padEnd(10)} ${row.personality.padEnd(12)} tot=${String(Math.round(row.totalValue)).padStart(5)}  ${skStr}${leansNonFarm ? "  <=NONFARM(" + topNon + ")" : ""}`,
    );
  }

  console.log(`  --- divergence: ${nonFarmLeaders.size} non-farm leaners; lines=${JSON.stringify(dominantLineCounts)}`);
  console.log(`  --- wealth top-5 non-farm lines: ${JSON.stringify(wealthDominanceTop5)}`);
  // distinct skill sheets (by level tuple)
  const sheets = new Set<string>();
  for (const row of rows) {
    const f = byId.get(row.id);
    const sk = f?.skills ?? { farming: 0, foraging: 0, fishing: 0, mining: 0 };
    sheets.add(SKILL_KINDS.map((a) => skillLevel(sk[a as Axis])).join(","));
  }
  console.log(`  --- distinct skill sheets: ${sheets.size} / ${rows.length}`);
}

for (const s of SEEDS) await runSeed(s);
