/* brief 45 — acceptance probe: festivals fired, contest winners, event-feed lines, podium gatherings. */
import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import { isWithinReach } from "@farm/sim-core/systems/proximity";
import { festivalForDay, festivalDayForSeason } from "@farm/sim-core/protocols/festival";
import type { GameEntity } from "@farm/sim-core/components";

const SEED = 0xc0ffee;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

const { world, scheduler, dayClock, eventFeed } = bootstrapSim({
  seed: SEED,
  ticksPerDay: TICKS_PER_DAY,
  maxDays: MAX_DAYS,
  pathfinder: new JsPathfinder(),
});

const FESTIVAL_PODIUM_TILE = { x: 43, y: 39 };

function findFarmer(id: number): GameEntity | undefined {
  for (const f of world.query("farmer")) if (f.id === id) return f;
  return undefined;
}
function nameOf(id: number): string {
  return findFarmer(id)?.farmer?.name ?? `#${id}`;
}

// Tracking state
interface FestivalResult {
  day: number;
  festivalId: string;
  name: string;
  winnerId: number | null;
  winnerName: string | null;
  winnerQuality: string | null;
  prize: number;
  participants: number[];
}

const festivalResults: FestivalResult[] = [];
const festivalAnnouncements: { day: number; festivalId: string; name: string }[] = [];
let feedFestivalLines = 0;

const podiumGathersByDay = new Map<number, Set<string>>();
let lastDay = -1;

const believedFestivalDays = new Set<number>();

const totalTicks = MAX_DAYS * TICKS_PER_DAY;
for (let tick = 0; tick < totalTicks; tick++) {
  scheduler.tick({ tick });
  const day = Math.floor(tick / TICKS_PER_DAY);
  const frac = (tick % TICKS_PER_DAY) / TICKS_PER_DAY;

  if (day !== lastDay) {
    lastDay = day;
    podiumGathersByDay.set(day, new Set());
  }

  if (!believedFestivalDays.has(day) && festivalForDay(day) !== null) {
    for (const f of world.query("farmer", "beliefs")) {
      const ft = f.beliefs.data.festivalToday as { name: string; contestCrop: string } | null | undefined;
      if (ft) {
        believedFestivalDays.add(day);
        break;
      }
    }
  }

  const todayFestival = festivalForDay(day);
  if (todayFestival !== null && frac >= 0.1 && frac < 0.9) {
    for (const f of world.query("farmer", "transform")) {
      if (f.player) continue;
      if (isWithinReach(f.transform, FESTIVAL_PODIUM_TILE.x, FESTIVAL_PODIUM_TILE.y)) {
        const gathers = podiumGathersByDay.get(day);
        if (gathers) gathers.add(f.farmer!.name);
      }
    }
  }
}

for (const entry of eventFeed.recent()) {
  const text = entry.text;
  // Festival result lines: "Spring Planting Fair — ...", "Summer Market Day — ...",
  // "Autumn Harvest Fair — ...", "Winter Feast — ..."
  if (
    text.startsWith("Spring Planting Fair") ||
    text.startsWith("Summer Market Day") ||
    text.startsWith("Autumn Harvest Fair") ||
    text.startsWith("Winter Feast")
  ) {
    feedFestivalLines++;
    // Parse the result into our tracking struct (from the narration line).
    // Format: "<FestivalName> — <WinnerName> wins with a <Quality> <crop>"
    // or:     "<FestivalName> — no contest entries this year"
    const dashIdx = text.indexOf(" — ");
    if (dashIdx !== -1) {
      const festName = text.slice(0, dashIdx);
      const resultPart = text.slice(dashIdx + 3);
      let winnerId: number | null = null;
      let winnerName: string | null = null;
      let winnerQuality: string | null = null;
      if (!resultPart.startsWith("no contest")) {
        const winsMatch = /^(.+?) wins with a (\w+) /.exec(resultPart);
        if (winsMatch) {
          winnerName = winsMatch[1] ?? null;
          winnerQuality = winsMatch[2]?.toLowerCase() ?? null;
          // Resolve id from the known farmers.
          for (const f of world.query("farmer")) {
            if (f.farmer?.name === winnerName) { winnerId = f.id ?? null; break; }
          }
        }
      }
      festivalResults.push({
        day: entry.day,
        festivalId: festName.toLowerCase().replace(/ /g, "-"),
        name: festName,
        winnerId,
        winnerName,
        winnerQuality,
        prize: 0, // not in narration; we know it from the FestivalDef
        participants: [],
      });
      console.log(`[day ${entry.day}] FEED FESTIVAL LINE: "${text}"`);
    }
  }
}

console.log("\n=== FESTIVAL CALENDAR (expected firing days) ===");
for (const season of ["spring", "summer", "autumn", "winter"] as const) {
  const d = festivalDayForSeason(season);
  console.log(`  ${season.padEnd(8)} festival: day ${d}`);
}

console.log("\n=== FESTIVAL GATHERINGS AT PODIUM ===");
let totalGatheringVisits = 0;
for (const [day, names] of podiumGathersByDay) {
  if (names.size > 0) {
    totalGatheringVisits += names.size;
    console.log(`  Day ${day}: ${[...names].join(", ")} at the podium`);
  }
}
if (totalGatheringVisits === 0) {
  console.log("  (no farmers observed at the podium during festival days)");
}

console.log("\n=== FESTIVAL RESULTS (from event-feed) ===");
for (const r of festivalResults) {
  if (r.winnerId !== null) {
    console.log(`  ${r.name} (day ${r.day}): WINNER ${r.winnerName} [${r.winnerQuality ?? "normal"}]`);
  } else {
    console.log(`  ${r.name} (day ${r.day}): no winner declared`);
  }
}
if (festivalResults.length === 0) {
  console.log("  (none)");
}

console.log("\n=== FARMER BELIEFS ON FESTIVAL DAYS ===");
console.log(`  Festival-today belief observed on days: ${[...believedFestivalDays].sort((a, b) => a - b).join(", ") || "(none)"}`);

console.log("\n=== DAY-100 STANDINGS ===");
for (const row of leaderboard(world)) {
  const wins = (findFarmer(row.id)?.farmer?.festivalWins ?? 0);
  console.log(`  ${row.name.padEnd(8)} ${row.personality.padEnd(12)} total=${Math.round(row.totalValue)} gold=${row.gold} festivalWins=${wins}`);
}

console.log("\n=== ACCEPTANCE (brief 45 festivals) ===");
const believedCount = believedFestivalDays.size;
const resolvedCount = festivalResults.length;
const resultsWithWinner = festivalResults.filter((r) => r.winnerId !== null).length;
console.log(`  festival-today belief written on ${believedCount} day(s): ${[...believedFestivalDays].sort((a, b) => a - b).join(", ")}`);
console.log(`  feed lines narrating festival results: ${feedFestivalLines}`);
console.log(`  contests with a declared winner: ${resultsWithWinner}`);
console.log(`  farmer-days at the festival podium: ${totalGatheringVisits}`);

const pass =
  believedCount >= 4 &&
  feedFestivalLines >= 4;

console.log(`\n  ACCEPTANCE ${pass ? "MET ✓" : "NOT MET ✗"}  (need ≥4 belief days AND ≥4 feed lines)`);
if (!pass) {
  if (believedCount < 4) console.log(`  !! festivalToday belief written on only ${believedCount} day(s) — check FestivalSystem.writeBeliefs`);
  if (feedFestivalLines < 4) console.log(`  !! Only ${feedFestivalLines} festival feed lines — check EventFeedSystem.captureFestival`);
}
