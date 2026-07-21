/**
 * Serializers for Hollow's metrics/chronicle/lineage output (promoted to
 * `@hollow/sim-core/observe` by chunk hollow-10a from the research CLI's
 * original `tools/hollow-sim/src/export.ts`, chunk hollow-07) —
 * `metrics.csv`/`.json`, `events.jsonl`, `lineage.json`. Kept as PURE
 * functions over plain data (no sim access, no `node:fs`) so they're
 * unit-testable in isolation AND safe to bundle into the browser client —
 * mirrors `tools/run-sim/src/format.ts`'s `toCsv`/`csvCell` pattern.
 *
 * Fixed key order + fixed decimal precision are both load-bearing:
 * research-CLI re-runs must diff byte-identical (see CLAUDE.md's
 * determinism note), so every column here is written in one unchanging
 * order and every float is rounded to `DECIMALS` places rather than left
 * at floating-point's full (and run-to-run-noise-prone at the last ULP)
 * precision.
 *
 * The node-fs write helpers (`ensureExportDir`/`writeExportFile`) are
 * deliberately NOT here — they stay in `tools/hollow-sim/src/export.ts`,
 * the one place allowed to import `node:fs`/`node:path` (this package must
 * stay browser-safe; the client bundles it).
 */
import { BEHAVIOR_GENES } from "../components";
import type { LineageEntry } from "../lineage";
import type { ChronicleEvent } from "./chronicle";

/** One metrics.csv/.json row's typed shape — `genes` is a
 *  `BEHAVIOR_GENES`-keyed record, flattened to `mean_gene_<name>` columns
 *  by `flattenMetricsRow` below. */
export interface MetricsRow {
  readonly tick: number;
  readonly year: number;
  readonly population: number;
  readonly births_cum: number;
  readonly births_window: number;
  readonly deaths_window: number;
  readonly deaths_oldAge_window: number;
  readonly deaths_starvation_window: number;
  readonly deaths_violence_window: number;
  /** Disease deaths this window (chunk hollow-15). Optional (defaults to 0 via
   *  `flattenMetricsRow`) for back-compat with pre-hollow-15 fixtures, same
   *  convention as `feud_active_dyads`. */
  readonly deaths_disease_window?: number;
  readonly community_count: number;
  readonly community_mean_size: number;
  readonly mean_pairwise_trust: number;
  readonly wealth_gini: number;
  readonly coop_window: number;
  readonly antag_window: number;
  /** Count of directed grudges at/above the feud start threshold, at THIS
   *  sample's tick (chunk hollow-12b) — see `metrics.ts`'s `activeFeudCount`.
   *  Optional (defaults to 0 via `flattenMetricsRow`) for back-compat with
   *  pre-hollow-12b `MetricsRow` fixtures. */
  readonly feud_active_dyads?: number;
  readonly genes: Readonly<Record<string, number>>;
}

const DECIMALS = 4;

/** Fixed, stable column order — the single source of truth both `toCsv`
 *  and `toJsonRows` iterate over. Gene columns are appended in
 *  `BEHAVIOR_GENES` order (that array's own order is itself fixed, see
 *  components/genome.ts). */
export const METRICS_COLUMNS: readonly string[] = [
  "tick",
  "year",
  "population",
  "births_cum",
  "births_window",
  "deaths_window",
  "deaths_oldAge_window",
  "deaths_starvation_window",
  "deaths_violence_window",
  "deaths_disease_window",
  "community_count",
  "community_mean_size",
  "mean_pairwise_trust",
  "wealth_gini",
  "coop_window",
  "antag_window",
  "feud_active_dyads",
  ...BEHAVIOR_GENES.map((gene) => `mean_gene_${gene}`),
];

/** Columns that are always whole counts — rendered as plain integers (no
 *  decimal padding); every other column is a derived float, rendered to
 *  `DECIMALS` fixed places. */
const INTEGER_COLUMNS: ReadonlySet<string> = new Set([
  "tick",
  "year",
  "population",
  "births_cum",
  "births_window",
  "deaths_window",
  "deaths_oldAge_window",
  "deaths_starvation_window",
  "deaths_violence_window",
  "deaths_disease_window",
  "community_count",
  "coop_window",
  "antag_window",
  "feud_active_dyads",
]);

/** Flattens one `MetricsRow` into a `METRICS_COLUMNS`-keyed plain map. */
export function flattenMetricsRow(row: MetricsRow): Record<string, number> {
  const flat: Record<string, number> = {
    tick: row.tick,
    year: row.year,
    population: row.population,
    births_cum: row.births_cum,
    births_window: row.births_window,
    deaths_window: row.deaths_window,
    deaths_oldAge_window: row.deaths_oldAge_window,
    deaths_starvation_window: row.deaths_starvation_window,
    deaths_violence_window: row.deaths_violence_window,
    deaths_disease_window: row.deaths_disease_window ?? 0,
    community_count: row.community_count,
    community_mean_size: row.community_mean_size,
    mean_pairwise_trust: row.mean_pairwise_trust,
    wealth_gini: row.wealth_gini,
    coop_window: row.coop_window,
    antag_window: row.antag_window,
    feud_active_dyads: row.feud_active_dyads ?? 0,
  };
  for (const gene of BEHAVIOR_GENES) {
    flat[`mean_gene_${gene}`] = row.genes[gene] ?? 0;
  }
  return flat;
}

function roundFixed(value: number): number {
  return Number(value.toFixed(DECIMALS));
}

function csvCell(column: string, value: number): string {
  return INTEGER_COLUMNS.has(column) ? String(value) : value.toFixed(DECIMALS);
}

/** Tidy CSV — one header row (`METRICS_COLUMNS`), one row per sample. */
export function metricsCsv(rows: readonly MetricsRow[]): string {
  const lines = [METRICS_COLUMNS.join(",")];
  for (const row of rows) {
    const flat = flattenMetricsRow(row);
    lines.push(METRICS_COLUMNS.map((c) => csvCell(c, flat[c] ?? 0)).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Same rows/columns as `metricsCsv`, as an array of plain objects (fixed
 *  key order per object, floats rounded to `DECIMALS`). */
export function metricsJson(rows: readonly MetricsRow[]): string {
  const objs = rows.map((row) => {
    const flat = flattenMetricsRow(row);
    const obj: Record<string, number> = {};
    for (const c of METRICS_COLUMNS) {
      const v = flat[c] ?? 0;
      obj[c] = INTEGER_COLUMNS.has(c) ? v : roundFixed(v);
    }
    return obj;
  });
  return JSON.stringify(objs, null, 2) + "\n";
}

/** `events.jsonl` — one JSON object per line, in the order captured
 *  (already tick-ordered, dispatch-ordered — see `chronicle.ts`). Each
 *  event's own key order (`tick`, `ontology`, then its body fields) is
 *  fixed by how `chronicle.ts` constructs it, so no re-ordering happens
 *  here. */
export function eventsJsonl(events: readonly ChronicleEvent[]): string {
  if (events.length === 0) return "";
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

/** `lineage.json` — every recorded ancestry entry, pretty-printed, sorted
 *  ascending by id (defensive re-sort — `LineageRegistry.all()` already
 *  sorts, but this stays correct even if called with an unsorted array). */
export function lineageJson(entries: readonly LineageEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.id - b.id);
  return JSON.stringify(sorted, null, 2) + "\n";
}
