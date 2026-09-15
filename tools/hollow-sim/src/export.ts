/**
 * Node-fs export helpers for the Hollow research CLI (chunk hollow-07,
 * refactored by chunk hollow-10a). The pure serializers that used to live
 * here directly (`METRICS_COLUMNS`, `metricsCsv`, `metricsJson`,
 * `eventsJsonl`, `lineageJson`, `flattenMetricsRow`, `MetricsRow`) were
 * promoted to `@hollow/sim-core/observe` as the single source of truth
 * shared by this CLI and the browser client's sim worker — `@hollow/
 * sim-core` must stay browser-safe, so the ONLY things allowed to stay in
 * this file are the two functions that actually touch `node:fs`/
 * `node:path`. Re-exporting the serializers here too means every existing
 * import of `"./export"` in this tool (and `export.test.ts`/
 * `run-core.test.ts`, unchanged) keeps resolving without a single
 * import-path edit.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunSummary } from "./run-core";

export {
  METRICS_COLUMNS,
  flattenMetricsRow,
  metricsCsv,
  metricsJson,
  eventsJsonl,
  lineageJson,
  type MetricsRow,
} from "@hollow/sim-core/observe";

/**
 * `summary.json` (audit-32) — the printed run summary (`RunSummary`), as its
 * own exported artifact rather than console-only output. Added purely
 * ADDITIVELY: `metrics.csv`/`.json`, `events.jsonl` and `lineage.json` are
 * unchanged byte-for-byte by this file (see `run-core.ts`'s header on why
 * `droppedEventCount` — the audit-32 fix — was NOT threaded into the
 * `events.jsonl` per-line format, which audit-12 deliberately kept stable).
 * Pretty-printed, one trailing newline, matching this file's other JSON
 * exports (`lineageJson`) for consistency; a run that never hit the CLI's
 * chronicle cap reports `droppedEventCount: 0` here, same as the console
 * summary.
 */
export function summaryJson(summary: RunSummary): string {
  return JSON.stringify(summary, null, 2) + "\n";
}

/** Creates `dir` (recursively) if it doesn't already exist. */
export function ensureExportDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Writes `payload` to `<dir>/<filename>`, creating `dir` first. */
export function writeExportFile(dir: string, filename: string, payload: string): void {
  ensureExportDir(dir);
  writeFileSync(join(dir, filename), payload);
}
