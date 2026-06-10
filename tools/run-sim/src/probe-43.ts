/**
 * probe-43.ts — brief 43 LIVE acceptance probe.
 *
 * Runs a full headless sim with the JS pathfinder (REQUIRED, or TravelSystem is
 * omitted and build-greenhouse can never fire) and reports:
 *   - greenhouses built + which farmer
 *   - whether an out-of-season crop grew in a greenhouse plot
 *   - per-farmer final skill levels (and that they rose over the run)
 *   - day-100 standings
 *
 * Run: npx tsx tools/run-sim/src/probe-43.ts
 */
import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import { skillLevel } from "@farm/sim-core/systems/skills";
import { CROP_SEASON } from "@farm/sim-core/economy";
import { seasonForDay } from "@farm/sim-core/protocols/weather";
import { SKILL_KINDS, type GameEntity } from "@farm/sim-core/components";

const SEED = 0xc0ffee;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

const { world, scheduler } = bootstrapSim({
  seed: SEED,
  ticksPerDay: TICKS_PER_DAY,
  maxDays: MAX_DAYS,
  pathfinder: new JsPathfinder(),
});

// Snapshot starting skills (all should be 0/level-1; skills component is lazily
// created on first XP grant, so most farmers have none at t=0).
const startSkill = new Map<number, Record<string, number>>();
for (const f of world.query("farmer")) {
  if (f.id !== undefined) startSkill.set(f.id, { ...(f.skills ?? { farming: 0, foraging: 0, fishing: 0, mining: 0 }) });
}

let greenhouseBuiltCount = 0;
const greenhouseBuiltBy = new Set<string>();
let outOfSeasonGreenhouseGrowth = false;
let firstGreenhouseDay = -1;
const ghPlantedSeen = new Set<string>();

const totalTicks = MAX_DAYS * TICKS_PER_DAY;
for (let tick = 0; tick < totalTicks; tick++) {
  scheduler.tick({ tick });
  const day = Math.floor(tick / TICKS_PER_DAY);

  // Track greenhouse construction the tick it appears.
  for (const g of world.query("greenhouse", "transform")) {
    const owner = findFarmer(g.greenhouse.ownerId);
    const name = owner?.farmer?.name ?? `#${g.greenhouse.ownerId}`;
    if (!greenhouseBuiltBy.has(name)) {
      greenhouseBuiltBy.add(name);
      greenhouseBuiltCount++;
      if (firstGreenhouseDay < 0) firstGreenhouseDay = day;
      console.log(`[day ${day}] greenhouse built by ${name} at (${g.greenhouse.tileX},${g.greenhouse.tileY})`);
    }
  }

  // Detect any planted greenhouse plot (debug) + out-of-season growth.
  const season = seasonForDay(day);
  for (const p of world.query("plot")) {
    if (p.plot.greenhouse !== true) continue;
    const s = p.plot.state;
    if (s.kind !== "planted") continue;
    const key = `${p.plot.tileX},${p.plot.tileY}`;
    if (!ghPlantedSeen.has(key)) {
      ghPlantedSeen.add(key);
      console.log(`[day ${day}] greenhouse plot (${key}) planted with ${s.crop} (cropSeason=${CROP_SEASON[s.crop]}, season=${season})`);
    }
    if (!outOfSeasonGreenhouseGrowth && CROP_SEASON[s.crop] !== season && s.daysGrowing > 0) {
      outOfSeasonGreenhouseGrowth = true;
      console.log(`[day ${day}] OUT-OF-SEASON ${s.crop} growing in greenhouse (season=${season}, daysGrowing=${s.daysGrowing.toFixed(2)})`);
    }
  }
}

function findFarmer(id: number): GameEntity | undefined {
  for (const f of world.query("farmer")) if (f.id === id) return f;
  return undefined;
}

console.log("\n=== SKILLS (final levels; start → end XP) ===");
let anySkillRose = false;
for (const f of world.query("farmer")) {
  if (f.id === undefined || !f.farmer) continue;
  const start = startSkill.get(f.id) ?? {};
  const parts: string[] = [];
  for (const axis of SKILL_KINDS) {
    const xp = f.skills?.[axis] ?? 0;
    const startXp = start[axis] ?? 0;
    if (xp > startXp) anySkillRose = true;
    parts.push(`${axis}=L${skillLevel(xp)}(${startXp}→${xp}xp)`);
  }
  console.log(`  ${f.farmer.name.padEnd(8)} ${parts.join("  ")}`);
}

console.log("\n=== DAY-100 STANDINGS ===");
for (const row of leaderboard(world)) {
  console.log(`  ${row.name.padEnd(8)} ${row.personality.padEnd(12)} total=${Math.round(row.totalValue)} gold=${row.gold} unsold=${Math.round(row.unsoldValue)}`);
}

console.log("\n=== ACCEPTANCE ===");
console.log(`  greenhouses built: ${greenhouseBuiltCount} (${[...greenhouseBuiltBy].join(", ") || "none"}), first on day ${firstGreenhouseDay}`);
console.log(`  out-of-season growth in greenhouse: ${outOfSeasonGreenhouseGrowth}`);
console.log(`  skills rose over the run: ${anySkillRose}`);
const pass = greenhouseBuiltCount >= 1 && anySkillRose;
console.log(`  ACCEPTANCE ${pass ? "MET" : "NOT MET"} (need >=1 greenhouse AND skills leveling)`);
