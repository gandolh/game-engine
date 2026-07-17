import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import { festivalPodiumTile } from "@farm/sim-core/agents/watering/shared";
import { isWithinReach } from "@farm/sim-core/systems/proximity";
import { festivalForDay, festivalStartDayForDay } from "@farm/sim-core/protocols/festival";
import { regionAt } from "@farm/sim-core/world/regions";
import { makePathfinder } from "../pathfinder";

// Festival-attendance evidence probe (2026-07-17: relocate the festival to the
// market plaza + make it multi-day, resolving the "festival attendance is
// geography-bound" open question).
//
// 1200 t/d is the sim's REAL default day length — a low-tick-rate probe
// under-reports travel-gated behaviour (documented trap, see
// probe-skill-diverge.ts). Run with PATHFINDER=wasm so travel to the plaza is
// route-equivalent to the live sim.
//
// The festival venue is the auction podium at the centre of the "village"
// market plaza (AUCTION_PODIUM_TILE = snapNear('village',0,0)) — the same plaza
// farmers already route to for the periodic market visit / selling. It now runs
// FESTIVAL_DAYS consecutive days (default 2). Because most farms sit 150–360
// tiles from the plaza at 8 ticks/tile, a same-day arrival is rare and farmers
// arrive STAGGERED across the window — so "attendance" is measured two ways per
// festival:
//   - maxSimultaneous: the most AI farmers (of 20; Pip is player-controlled and
//     never auto-navigates) physically in the village region AT ONCE.
//   - cumulativeVisited: distinct AI farmers who were in the village region at
//     any sampled tick during the multi-day window (the multi-day payoff — a
//     farmer who travels in on day 1 and celebrates on day 2 counts).
//   - cumulativeReachedPodium: distinct farmers who got within Chebyshev-1 of the
//     podium tile itself.
// Plus a farm-output-dip check: mean day-over-day wealth gain across the festival
// window vs. the mean gain of the non-festival days immediately around it.
// Run each seed in its OWN process (SEED=…) for clean evidence: the connectivity
// component-map cache (world/connectivity.ts) is not reset on setActiveWorld, so
// running multiple seeds in one process would have later seeds reuse the first
// seed's connectivity map. `for s in …; do SEED=$s tsx probe-festival.ts; done`.
const SEEDS = process.env["SEED"] !== undefined
  ? [Number(process.env["SEED"])]
  : [0xc0ffee, 1, 42];
const TICKS_PER_DAY = 1200;
const MAX_DAYS = 100;
const SAMPLE_EVERY = 50; // ticks; attendance is sampled this often on festival days

const FESTIVAL_REGION = "village";

async function runSeed(seed: number): Promise<void> {
  const { world, scheduler } = bootstrapSim({
    seed,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: MAX_DAYS,
    pathfinder: await makePathfinder(),
  });

  const podium = festivalPodiumTile();
  const totalTicks = MAX_DAYS * TICKS_PER_DAY;

  // Per festival (keyed by start day): attendance accumulators.
  const maxSimul = new Map<number, number>();
  const cumVisited = new Map<number, Set<number>>();
  const cumReached = new Map<number, Set<number>>();

  // Daily total-wealth snapshot (once per day, right before midnight) for the
  // output-dip check.
  const dailyWealth = new Map<number, number>();

  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    const day = Math.floor(tick / TICKS_PER_DAY);

    if (festivalForDay(day) !== null && tick % SAMPLE_EVERY === 0) {
      const start = festivalStartDayForDay(day)!;
      if (!cumVisited.has(start)) { cumVisited.set(start, new Set()); cumReached.set(start, new Set()); }
      let simul = 0;
      for (const f of world.query("farmer", "personality")) {
        if (f.personality.kind === "pip" || !f.transform || f.id === undefined) continue;
        const inRegion = regionAt(Math.round(f.transform.x), Math.round(f.transform.y)) === FESTIVAL_REGION;
        if (inRegion) { simul++; cumVisited.get(start)!.add(f.id); }
        if (isWithinReach(f.transform, podium.x, podium.y)) cumReached.get(start)!.add(f.id);
      }
      if (simul > (maxSimul.get(start) ?? 0)) maxSimul.set(start, simul);
    }

    if (tick % TICKS_PER_DAY === TICKS_PER_DAY - 1) {
      const board = leaderboard(world);
      let total = 0;
      for (const f of world.query("farmer", "personality")) {
        if (f.personality.kind === "pip") continue;
        total += board.find((r) => r.id === f.id)?.totalValue ?? 0;
      }
      dailyWealth.set(day, total);
    }
  }

  const starts = [...maxSimul.keys()].sort((a, b) => a - b);
  const windowDays = (start: number): number[] => {
    const days: number[] = [];
    for (let d = start; festivalForDay(d) !== null; d++) days.push(d);
    return days;
  };

  console.log(`\n================= SEED 0x${seed.toString(16)} =================`);
  let majorityVisited = 0;
  for (const start of starts) {
    const visited = cumVisited.get(start)!.size;
    const reached = cumReached.get(start)!.size;
    const simul = maxSimul.get(start)!;
    const isMajority = visited > 10; // >50% of 20
    if (isMajority) majorityVisited++;
    console.log(
      `  festival ${String(start).padStart(3)} (days ${windowDays(start).join(",")}): ` +
      `maxSimultaneous=${simul}/20  cumulativeVisited=${visited}/20  cumulativeReachedPodium=${reached}/20` +
      `  ${isMajority ? "MAJORITY visited" : "minority"}`,
    );
  }
  console.log(`  --- festivals with a cumulative-visited majority: ${majorityVisited}/${starts.length}`);

  console.log(`  --- output-dip check (mean daily wealth gain: festival window vs surrounding non-festival days):`);
  for (const start of starts) {
    const days = windowDays(start);
    const windowGains = days.map((d) => (dailyWealth.get(d) ?? 0) - (dailyWealth.get(d - 1) ?? 0));
    const avgWindow = windowGains.reduce((a, b) => a + b, 0) / windowGains.length;
    const lastDay = days[days.length - 1]!;
    const neighborDays = [start - 3, start - 2, start - 1, lastDay + 1, lastDay + 2, lastDay + 3].filter(
      (x) => x >= 1 && x <= MAX_DAYS - 1 && festivalForDay(x) === null,
    );
    const neighborGains = neighborDays.map((x) => (dailyWealth.get(x) ?? 0) - (dailyWealth.get(x - 1) ?? 0));
    const avgNeighbor = neighborGains.length > 0 ? neighborGains.reduce((a, b) => a + b, 0) / neighborGains.length : 0;
    const dipPct = avgNeighbor !== 0 ? ((avgNeighbor - avgWindow) / Math.abs(avgNeighbor)) * 100 : 0;
    console.log(
      `      festival ${String(start).padStart(3)} (days ${days.join(",")}): ` +
      `mean-window-gain=${avgWindow.toFixed(1)}g  avg-neighbor-gain=${avgNeighbor.toFixed(1)}g  dip=${dipPct.toFixed(1)}%`,
    );
  }
}

for (const s of SEEDS) await runSeed(s);
