import { bootstrapSim, leaderboard, type FarmerSummary } from "farm-valley/src/sim-bootstrap";

const SEED = Number(process.env["SEED"] ?? 0xc0ffee);
const TICKS_PER_DAY = Number(process.env["TICKS_PER_DAY"] ?? 20);
const MAX_DAYS = Number(process.env["MAX_DAYS"] ?? 100);
const PROGRESS_EVERY = Number(process.env["PROGRESS_EVERY"] ?? 10);

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

function lpad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

function printDayLine(day: number, weather: string, summaries: FarmerSummary[]): void {
  const cells = summaries
    .map((f) => `${f.name.slice(0, 4)}:${lpad(f.gold, 4)}g/${lpad(f.totalValue, 4)}t`)
    .join("  ");
  console.log(`day ${lpad(day, 3)} weather=${pad(weather, 7)} ${cells}`);
}

function printFinalLeaderboard(day: number, weather: string, summaries: FarmerSummary[]): void {
  console.log();
  console.log("=".repeat(72));
  console.log(`  FARM VALLEY  —  final standings after ${day} days  (weather: ${weather})`);
  console.log("=".repeat(72));
  console.log(
    `  ${pad("rank", 5)}${pad("name", 10)}${pad("personality", 14)}${lpad("gold", 8)}${lpad("unsold", 8)}${lpad("total", 8)}  crops`,
  );
  console.log("  " + "-".repeat(70));
  summaries.forEach((s, i) => {
    const cropStr = `r${s.crops.radish} w${s.crops.wheat} p${s.crops.pumpkin}`;
    console.log(
      `  ${pad(i + 1, 5)}${pad(s.name, 10)}${pad(s.personality, 14)}${lpad(s.gold, 8)}${lpad(s.unsoldValue, 8)}${lpad(s.totalValue, 8)}  ${cropStr}`,
    );
  });
  console.log("=".repeat(72));
}

function summarize(
  world: ReturnType<typeof bootstrapSim>["world"],
): { weather: string; summaries: FarmerSummary[] } {
  let weather = "normal";
  for (const w of world.query("weatherStation")) {
    weather = w.weatherStation.current;
    break;
  }
  return { weather, summaries: leaderboard(world) };
}

const { world, scheduler, dayClock } = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });

console.log(
  `Farm Valley headless run — seed=0x${SEED.toString(16)}, ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day`,
);
console.log();

const totalTicks = MAX_DAYS * TICKS_PER_DAY;
let lastReported = -1;
for (let tick = 0; tick < totalTicks; tick++) {
  scheduler.tick({ tick });
  if (dayClock.day !== lastReported && dayClock.day % PROGRESS_EVERY === 0) {
    const { weather, summaries } = summarize(world);
    printDayLine(dayClock.day, weather, summaries);
    lastReported = dayClock.day;
  }
}

const { weather, summaries } = summarize(world);
printFinalLeaderboard(dayClock.day, weather, summaries);
