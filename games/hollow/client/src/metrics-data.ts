/**
 * `metrics-data.ts` — PURE data-shaping for the live metrics dashboard
 * (chunk hollow-10b): picking one column's time series out of the
 * accumulated `MetricsRow[]`, scaling it for a chart's y-axis, and
 * formatting a single value for a legend. No DOM, no canvas — `chart-draw.ts`
 * (the actual canvas 2D drawing) and `dashboard-panel.ts` (the DOM wiring)
 * consume these; mirrors `chronicle-format.ts`'s split from
 * `chronicle-panel.ts`.
 */
import { flattenMetricsRow, type MetricsRow } from "@hollow/sim-core/observe";

/**
 * One column's values across `rows`, in row (sample) order — a thin pure
 * wrapper over `flattenMetricsRow` (the SAME flattening `metricsCsv` uses,
 * including the `mean_gene_<name>` columns), so every number the dashboard
 * plots is guaranteed to match the exported CSV. A column absent from a
 * given row (shouldn't happen — `flattenMetricsRow` always populates every
 * `METRICS_COLUMNS` key — but defensive) reads as 0 for that row.
 */
export function metricSeries(rows: readonly MetricsRow[], column: string): number[] {
  return rows.map((row) => flattenMetricsRow(row)[column] ?? 0);
}

export interface ChartScale {
  readonly min: number;
  readonly max: number;
}

/**
 * A pure min/max y-axis scale for `values`. Never degenerates to a
 * zero-width range (which would divide-by-zero when a caller maps a value
 * to a pixel fraction): an empty series scales to a fixed `[0, 1]`
 * placeholder, and an all-equal series is padded into a small visible band
 * centered on that value (half the value's own magnitude, or `1` either
 * side of `0`).
 */
export function chartScale(values: readonly number[]): ChartScale {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.5;
    return { min: min - pad, max: max + pad };
  }
  return { min, max };
}

/** A compact display string for one metric value — whole numbers print
 *  plain, everything else to 2 decimal places. Shared by every dashboard
 *  legend so e.g. `population` reads `"8"` while `wealth_gini` reads
 *  `"0.34"`. Same rounding idiom as `inspect-panel.ts`'s local `fmt`. */
export function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
