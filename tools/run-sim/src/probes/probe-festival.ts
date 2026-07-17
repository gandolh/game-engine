import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import { festivalPodiumTile } from "@farm/sim-core/agents/watering/shared";
import { isWithinReach } from "@farm/sim-core/systems/proximity";
import { festivalForDay } from "@farm/sim-core/protocols/festival";
import { makePathfinder } from "../pathfinder";

// Chunk E evidence probe (2026-07-16 brief: farm-festival-priority-bump).
//
// 1200 t/d is the sim's REAL default day length — a low-tick-rate probe
// under-reports travel-gated behaviour (documented trap, see
// probe-skill-diverge.ts). Run with PATHFINDER=wasm so travel to the podium is
// route-equivalent to the live sim.
//
// Measures, on each of the 4 festival days (13/38/63/88):
//   - podium occupancy (of the 20 AI farmers — Pip is player-controlled and
//     never auto-navigates) at a mid-day sample (work phase, fraction 0.5) and
//     a late-day sample (evening/night boundary, fraction 0.95) — most farms
//     are NOT adjacent to the town square, so a same-day arrival is often only
//     achieved late in the day; "festival hours" is read as the whole active
//     day, not just the work-phase window.
//   - farm output dip: each festival day's total-wealth GAIN (sum of
//     leaderboard totalValue, day over day) vs. the mean gain of the 3
//     non-festival days immediately before and after.
const SEEDS = [0xc0ffee, 1, 42];
const TICKS_PER_DAY = 1200;
const MAX_DAYS = 100;
const MID_DAY_FRACTION = 0.5;
const LATE_DAY_FRACTION = 0.95;

async function runSeed(seed: number): Promise<void> {
  const { world, scheduler } = bootstrapSim({
    seed,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: MAX_DAYS,
    pathfinder: await makePathfinder(),
  });

  const podium = festivalPodiumTile();
  const totalTicks = MAX_DAYS * TICKS_PER_DAY;

  const festivalDays: number[] = [];
  for (let d = 1; d <= MAX_DAYS; d++) if (festivalForDay(d) !== null) festivalDays.push(d);

  const midSampleTicks = new Map<number, number>(); // tick -> day
  const lateSampleTicks = new Map<number, number>();
  for (const d of festivalDays) {
    midSampleTicks.set(d * TICKS_PER_DAY + Math.floor(MID_DAY_FRACTION * TICKS_PER_DAY), d);
    lateSampleTicks.set(d * TICKS_PER_DAY + Math.floor(LATE_DAY_FRACTION * TICKS_PER_DAY), d);
  }

  const occupancy = new Map<number, { mid: number; late: number; total: number }>();
  for (const d of festivalDays) occupancy.set(d, { mid: 0, late: 0, total: 0 });

  // Daily total-wealth snapshot (sampled once per day, right before midnight)
  // to compute day-over-day gain for the output-dip check.
  const dailyWealth = new Map<number, number>();
  const wealthSampleTick = new Set<number>();
  for (let d = 0; d < MAX_DAYS; d++) {
    wealthSampleTick.add(d * TICKS_PER_DAY + TICKS_PER_DAY - 1);
  }

  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });

    const midDay = midSampleTicks.get(tick);
    if (midDay !== undefined) {
      let n = 0, total = 0;
      for (const f of world.query("farmer", "personality")) {
        if (f.personality.kind === "pip") continue;
        total++;
        if (isWithinReach(f.transform, podium.x, podium.y)) n++;
      }
      const rec = occupancy.get(midDay)!;
      rec.mid = n;
      rec.total = total;
    }
    const lateDay = lateSampleTicks.get(tick);
    if (lateDay !== undefined) {
      let n = 0;
      for (const f of world.query("farmer", "personality")) {
        if (f.personality.kind === "pip") continue;
        if (isWithinReach(f.transform, podium.x, podium.y)) n++;
      }
      occupancy.get(lateDay)!.late = n;
    }

    if (wealthSampleTick.has(tick)) {
      const day = Math.floor(tick / TICKS_PER_DAY);
      const board = leaderboard(world);
      let total = 0;
      for (const f of world.query("farmer", "personality")) {
        if (f.personality.kind === "pip") continue;
        const row = board.find((r) => r.id === f.id);
        total += row?.totalValue ?? 0;
      }
      dailyWealth.set(day, total);
    }
  }

  console.log(`\n================= SEED 0x${seed.toString(16)} =================`);
  let majorityDays = 0;
  for (const d of festivalDays) {
    const rec = occupancy.get(d)!;
    const majority = rec.late > rec.total / 2;
    if (majority) majorityDays++;
    console.log(
      `  festival day ${String(d).padStart(3)}: mid-day=${rec.mid}/${rec.total}  late-day=${rec.late}/${rec.total}` +
      `  ${majority ? "MAJORITY" : "not majority"}`,
    );
  }
  console.log(`  --- majority-attendance festival days: ${majorityDays}/${festivalDays.length}`);

  console.log(`  --- output-dip check (daily wealth gain, festival day vs surrounding non-festival days):`);
  for (const d of festivalDays) {
    const gain = (dailyWealth.get(d) ?? 0) - (dailyWealth.get(d - 1) ?? 0);
    const neighborDays = [d - 3, d - 2, d - 1, d + 1, d + 2, d + 3].filter(
      (x) => x >= 1 && x <= MAX_DAYS - 1 && festivalForDay(x) === null,
    );
    const neighborGains = neighborDays.map((x) => (dailyWealth.get(x) ?? 0) - (dailyWealth.get(x - 1) ?? 0));
    const avgNeighbor = neighborGains.length > 0 ? neighborGains.reduce((a, b) => a + b, 0) / neighborGains.length : 0;
    const dipPct = avgNeighbor !== 0 ? ((avgNeighbor - gain) / Math.abs(avgNeighbor)) * 100 : 0;
    console.log(
      `      day ${String(d).padStart(3)}: gain=${gain.toFixed(1)}g  avg-neighbor-gain=${avgNeighbor.toFixed(1)}g  dip=${dipPct.toFixed(1)}%`,
    );
  }
}

for (const s of SEEDS) await runSeed(s);
