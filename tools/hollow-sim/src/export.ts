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

export {
  METRICS_COLUMNS,
  flattenMetricsRow,
  metricsCsv,
  metricsJson,
  eventsJsonl,
  lineageJson,
  type MetricsRow,
} from "@hollow/sim-core/observe";

/** Creates `dir` (recursively) if it doesn't already exist. */
export function ensureExportDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Writes `payload` to `<dir>/<filename>`, creating `dir` first. */
export function writeExportFile(dir: string, filename: string, payload: string): void {
  ensureExportDir(dir);
  writeFileSync(join(dir, filename), payload);
}
