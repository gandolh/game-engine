/**
 * format.ts — human-readable console output + machine-readable CSV/JSON export.
 *
 * Diagnostics are caller's choice of stream; the CSV/JSON payload is written to
 * EXPORT_FILE or stdout so it can be piped cleanly.
 */
import { writeFileSync } from "node:fs";
import type { FarmerSummary, RunResult } from "./run-core";

export function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

export function lpad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

export function printDayLine(day: number, weather: string, summaries: FarmerSummary[]): void {
  const cells = summaries
    .map((f) => `${f.name.slice(0, 4)}:${lpad(f.gold, 4)}g/${lpad(f.totalValue, 4)}t`)
    .join("  ");
  console.log(`day ${lpad(day, 3)} weather=${pad(weather, 7)} ${cells}`);
}

export function printFinalLeaderboard(
  day: number,
  weather: string,
  summaries: FarmerSummary[],
): void {
  console.log();
  console.log("=".repeat(72));
  console.log(`  FARM VALLEY  —  final standings after ${day} days  (weather: ${weather})`);
  console.log("=".repeat(72));
  console.log(
    `  ${pad("rank", 5)}${pad("name", 10)}${pad("personality", 14)}${lpad("gold", 8)}${lpad("unsold", 8)}${lpad("total", 8)}  crops`,
  );
  console.log("  " + "-".repeat(70));
  summaries.forEach((s, i) => {
    const cropStr = `r${s.crops.radish ?? 0} w${s.crops.wheat ?? 0} p${s.crops.pumpkin ?? 0}`;
    console.log(
      `  ${pad(i + 1, 5)}${pad(s.name, 10)}${pad(s.personality, 14)}${lpad(s.gold, 8)}${lpad(s.unsoldValue, 8)}${lpad(s.totalValue, 8)}  ${cropStr}`,
    );
  });
  console.log("=".repeat(72));
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

export function emitExport(format: string, result: RunResult, exportFile?: string): void {
  const rows = toRows(result);
  let payload: string;
  if (format === "json") {
    payload = JSON.stringify(rows, null, 2) + "\n";
  } else {
    payload = toCsv(rows);
  }
  if (exportFile) {
    writeFileSync(exportFile, payload);
    console.error(`wrote ${rows.length} rows to ${exportFile} (${format})`);
  } else {
    process.stdout.write(payload);
  }
}
