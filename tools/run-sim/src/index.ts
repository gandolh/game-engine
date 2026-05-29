import { writeFileSync } from "node:fs";
import { bootstrapSim, leaderboard, type FarmerSummary } from "farm-valley/src/sim-bootstrap";
import { ONT_SIMULATION, type ShockBody } from "farm-valley/src/protocols";

const SEED = Number(process.env["SEED"] ?? 0xc0ffee);
const TICKS_PER_DAY = Number(process.env["TICKS_PER_DAY"] ?? 20);
const MAX_DAYS = Number(process.env["MAX_DAYS"] ?? 100);
const PROGRESS_EVERY = Number(process.env["PROGRESS_EVERY"] ?? 10);

// Mode gates. The default (no env set) path must behave exactly as before.
const CHECK_DETERMINISM =
  process.env["CHECK_DETERMINISM"] === "1" || process.argv.includes("--check-determinism");
const EXPORT = (process.env["EXPORT"] ?? "").toLowerCase(); // "csv" | "json" | ""
const EXPORT_FILE = process.env["EXPORT_FILE"]; // optional path; default = stdout

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

function currentWeather(world: ReturnType<typeof bootstrapSim>["world"]): string {
  for (const w of world.query("weatherStation")) {
    return w.weatherStation.current;
  }
  return "normal";
}

function summarize(
  world: ReturnType<typeof bootstrapSim>["world"],
): { weather: string; summaries: FarmerSummary[] } {
  return { weather: currentWeather(world), summaries: leaderboard(world) };
}

// ---------------------------------------------------------------------------
// Per-day capture — the canonical, machine-comparable record of a single run.
// Used by both the determinism check and the CSV/JSON export so they observe
// the exact same sim outputs (never wall-clock timings).
// ---------------------------------------------------------------------------

interface DaySnapshot {
  day: number;
  weather: string;
  summaries: FarmerSummary[];
}

interface RunResult {
  perDay: DaySnapshot[];
  finalDay: number;
  finalWeather: string;
  finalStandings: FarmerSummary[];
}

interface RunOptions {
  seed: number;
  ticksPerDay: number;
  maxDays: number;
}

/**
 * Boots and ticks a sim to completion, capturing a leaderboard snapshot at the
 * end of every distinct day plus the final standings. No console output, no
 * timing — pure sim outputs, so the result is byte-for-byte comparable.
 */
function runOnce(opts: RunOptions): RunResult {
  const { world, scheduler, dayClock } = bootstrapSim({
    seed: opts.seed,
    ticksPerDay: opts.ticksPerDay,
    maxDays: opts.maxDays,
  });

  const perDay: DaySnapshot[] = [];
  let lastCaptured = -1;
  const totalTicks = opts.maxDays * opts.ticksPerDay;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    if (dayClock.day !== lastCaptured) {
      const { weather, summaries } = summarize(world);
      perDay.push({ day: dayClock.day, weather, summaries });
      lastCaptured = dayClock.day;
    }
  }

  const { weather, summaries } = summarize(world);
  return {
    perDay,
    finalDay: dayClock.day,
    finalWeather: weather,
    finalStandings: summaries,
  };
}

// A stable string form of a run, used purely for equality comparison.
function fingerprint(result: RunResult): string {
  return JSON.stringify(result);
}

// First textual difference between two runs (day-by-day), for a helpful report.
function describeDivergence(a: RunResult, b: RunResult): string {
  const n = Math.max(a.perDay.length, b.perDay.length);
  for (let i = 0; i < n; i++) {
    const da = a.perDay[i];
    const db = b.perDay[i];
    const sa = JSON.stringify(da ?? null);
    const sb = JSON.stringify(db ?? null);
    if (sa !== sb) {
      return `first divergence at perDay index ${i}:\n  run A: ${sa}\n  run B: ${sb}`;
    }
  }
  const fa = JSON.stringify(a.finalStandings);
  const fb = JSON.stringify(b.finalStandings);
  if (fa !== fb) {
    return `final standings differ:\n  run A: ${fa}\n  run B: ${fb}`;
  }
  return "runs differ but no per-field difference located (length mismatch?)";
}

// ---------------------------------------------------------------------------
// CSV / JSON export
// ---------------------------------------------------------------------------

const EXPORT_COLUMNS = [
  "day",
  "name",
  "personality",
  "gold",
  "unsold",
  "total",
  "weather",
] as const;

interface ExportRow {
  day: number;
  name: string;
  personality: string;
  gold: number;
  unsold: number;
  total: number;
  weather: string;
}

function toRows(result: RunResult): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const snap of result.perDay) {
    for (const s of snap.summaries) {
      rows.push({
        day: snap.day,
        name: s.name,
        personality: s.personality,
        gold: s.gold,
        unsold: s.unsoldValue,
        total: s.totalValue,
        weather: snap.weather,
      });
    }
  }
  return rows;
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

function emitExport(format: string, result: RunResult): void {
  const rows = toRows(result);
  let payload: string;
  if (format === "json") {
    payload = JSON.stringify(rows, null, 2) + "\n";
  } else {
    payload = toCsv(rows);
  }
  if (EXPORT_FILE) {
    writeFileSync(EXPORT_FILE, payload);
    console.error(`wrote ${rows.length} rows to ${EXPORT_FILE} (${format})`);
  } else {
    process.stdout.write(payload);
  }
}

// ---------------------------------------------------------------------------
// Mode dispatch
// ---------------------------------------------------------------------------

if (CHECK_DETERMINISM) {
  // Multi-seed sanity: SEEDS=a,b,c overrides the single SEED. Each seed is
  // verified internally reproducible (run twice, compare). Diagnostics go to
  // stderr so a piped CSV/stdout never gets polluted.
  const seeds =
    process.env["SEEDS"] !== undefined && process.env["SEEDS"] !== ""
      ? process.env["SEEDS"].split(",").map((s) => Number(s.trim()))
      : [SEED];

  console.error(
    `Determinism check — ${seeds.length} seed(s), ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day`,
  );

  let anyDiverged = false;
  for (const seed of seeds) {
    const a = runOnce({ seed, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    const b = runOnce({ seed, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    const seedHex = `0x${(seed >>> 0).toString(16)}`;
    if (fingerprint(a) === fingerprint(b)) {
      console.error(
        `  seed ${seedHex}: MATCH (${a.perDay.length} day snapshots, ${a.finalStandings.length} farmers)`,
      );
    } else {
      anyDiverged = true;
      console.error(`  seed ${seedHex}: DIVERGE`);
      console.error(describeDivergence(a, b));
    }
  }

  if (anyDiverged) {
    console.error("DETERMINISM CHECK FAILED — sim is not reproducible for at least one seed.");
    process.exit(1);
  }
  console.error("DETERMINISM CHECK PASSED — all seeds reproduced identically.");
  process.exit(0);
} else if (EXPORT === "csv" || EXPORT === "json") {
  // Export mode: machine-readable per-day rows. Suppress the human-readable
  // leaderboard so stdout stays clean for piping.
  const result = runOnce({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
  emitExport(EXPORT, result);
} else {
  // Default mode — unchanged human-readable run.
  const { world, scheduler, dayClock, bus } = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });

  // Narrate the mid-game shock when it fires (otherwise it's an invisible moment).
  bus.subscribeOntology(ONT_SIMULATION.SHOCK, (msg) => {
    const b = msg.body as unknown as ShockBody;
    console.log(
      `  *** SHOCK day ${b.day}: ${b.kind} struck ${b.targetName} — ${b.plotsWiped} planted plot(s) wiped ***`,
    );
  });

  console.log(
    `Farm Valley headless run — seed=0x${SEED.toString(16)}, ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day`,
  );
  console.log();

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  let lastReported = -1;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    // InboxDispatchSystem already flushed this tick's messages into the bus's
    // deliverable buffer; fire subscriber handlers so the shock narration prints.
    bus.notifySubscribers();
    if (dayClock.day !== lastReported && dayClock.day % PROGRESS_EVERY === 0) {
      const { weather, summaries } = summarize(world);
      printDayLine(dayClock.day, weather, summaries);
      lastReported = dayClock.day;
    }
  }

  const { weather, summaries } = summarize(world);
  printFinalLeaderboard(dayClock.day, weather, summaries);
}
