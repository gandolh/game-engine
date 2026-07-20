/**
 * `dashboard-panel.ts` — the live metrics dashboard DOM panel (chunk
 * hollow-10b). Reads `research-store.ts`'s accumulated rows on mount
 * (`getMetrics()`) and redraws EVERY chart from the full series each time a
 * new row arrives (`onMetricsRow()`) — once per sim-year, never per render
 * frame (see `research-store.ts`'s header: one row per
 * `tick % ticksPerDay === 0` boundary). The canvases themselves are built
 * once; only their contents (and each legend's current-value text) are
 * refreshed on a new row — no DOM rebuild.
 *
 * Chart selection covers every metric the brief calls out: population;
 * births_window; deaths by cause; community_count + community_mean_size;
 * mean_pairwise_trust; wealth_gini; coop_window vs antag_window; and a
 * representative slice of gene drift (not all 7 `BEHAVIOR_GENES` — "a few"
 * per the brief — to keep the panel compact).
 *
 * Palette purity: every legend/heading color is a `HOLLOW_PAL.*` role (inline
 * style, same idiom as `inspect-panel.ts`); chart line colors are threaded
 * as `HOLLOW_PAL` role NAMES into `chart-draw.ts`, which resolves them.
 */
import { HOLLOW_PAL } from "./render/hollow-palette";
import { getMetrics, onMetricsRow } from "./research-store";
import { metricSeries, formatMetricValue } from "./metrics-data";
import { drawLineChart, type ChartSeries } from "./chart-draw";

export interface DashboardPanel {
  readonly el: HTMLElement;
  /** Unsubscribes from the research store — see `ChroniclePanel.dispose`'s
   *  doc for why this exists even though no production caller uses it yet. */
  dispose(): void;
}

interface SeriesConfig {
  readonly column: string;
  readonly label: string;
  readonly colorRole: keyof typeof HOLLOW_PAL;
}

interface ChartConfig {
  readonly title: string;
  readonly series: readonly SeriesConfig[];
}

const CHART_CONFIGS: readonly ChartConfig[] = [
  {
    title: "Population",
    series: [{ column: "population", label: "population", colorRole: "cream" }],
  },
  {
    title: "Births & deaths (per window)",
    series: [
      { column: "births_window", label: "births", colorRole: "green" },
      { column: "deaths_oldAge_window", label: "old age", colorRole: "steel" },
      { column: "deaths_starvation_window", label: "starvation", colorRole: "orange" },
      { column: "deaths_violence_window", label: "violence", colorRole: "red" },
    ],
  },
  {
    title: "Communities",
    series: [
      { column: "community_count", label: "count", colorRole: "skyBlue" },
      { column: "community_mean_size", label: "mean size", colorRole: "cyan" },
    ],
  },
  {
    title: "Trust & wealth",
    series: [
      { column: "mean_pairwise_trust", label: "mean trust", colorRole: "gold" },
      { column: "wealth_gini", label: "wealth gini", colorRole: "mauve" },
    ],
  },
  {
    title: "Cooperation vs antagonism (per window)",
    series: [
      { column: "coop_window", label: "cooperative", colorRole: "green" },
      { column: "antag_window", label: "antagonistic", colorRole: "red" },
    ],
  },
  {
    title: "Gene drift (mean)",
    series: [
      { column: "mean_gene_sociability", label: "sociability", colorRole: "cyan" },
      { column: "mean_gene_aggression", label: "aggression", colorRole: "red" },
      { column: "mean_gene_greed", label: "greed", colorRole: "gold" },
      { column: "mean_gene_industriousness", label: "industriousness", colorRole: "greenMid" },
    ],
  },
];

const CHART_WIDTH = 300;
const CHART_HEIGHT = 70;

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

interface ChartHandle {
  readonly config: ChartConfig;
  readonly canvas: HTMLCanvasElement;
  readonly legendValueEls: readonly HTMLElement[];
}

/** Builds the (unattached) dashboard panel DOM tree, wired live to
 *  `research-store.ts`. Renders whatever's already accumulated on mount,
 *  then redraws on every subsequent `onMetricsRow` sample. */
export function createDashboardPanel(): DashboardPanel {
  const root = el("div", "hollow-dashboard-panel");
  root.style.background = HOLLOW_PAL.ink;
  root.style.color = HOLLOW_PAL.cream;
  root.style.borderLeft = `2px solid ${HOLLOW_PAL.navy}`;

  const header = el("h2", "hollow-dashboard-title");
  header.textContent = "Metrics";
  header.style.color = HOLLOW_PAL.gold;
  root.appendChild(header);

  const charts: ChartHandle[] = [];

  for (const config of CHART_CONFIGS) {
    const chartEl = el("div", "hollow-dashboard-chart");

    const title = el("h4", "hollow-dashboard-chart-title");
    title.textContent = config.title;
    title.style.color = HOLLOW_PAL.silver;
    chartEl.appendChild(title);

    const canvas = document.createElement("canvas");
    canvas.className = "hollow-dashboard-canvas";
    canvas.width = CHART_WIDTH;
    canvas.height = CHART_HEIGHT;
    chartEl.appendChild(canvas);

    const legend = el("div", "hollow-dashboard-legend");
    const legendValueEls: HTMLElement[] = [];
    for (const s of config.series) {
      const item = el("span", "hollow-dashboard-legend-item");
      const swatch = el("span", "hollow-dashboard-legend-swatch");
      swatch.style.background = HOLLOW_PAL[s.colorRole];
      const labelEl = document.createElement("span");
      labelEl.textContent = `${s.label}: `;
      labelEl.style.color = HOLLOW_PAL.steel;
      const valueEl = document.createElement("span");
      valueEl.className = "hollow-dashboard-legend-value";
      valueEl.style.color = HOLLOW_PAL.cream;
      valueEl.textContent = "—";
      item.appendChild(swatch);
      item.appendChild(labelEl);
      item.appendChild(valueEl);
      legend.appendChild(item);
      legendValueEls.push(valueEl);
    }
    chartEl.appendChild(legend);

    root.appendChild(chartEl);
    charts.push({ config, canvas, legendValueEls });
  }

  function redraw(): void {
    const rows = getMetrics();
    const last = rows[rows.length - 1];
    for (const chart of charts) {
      const series: ChartSeries[] = chart.config.series.map((s) => ({
        values: metricSeries(rows, s.column),
        colorRole: s.colorRole,
      }));
      const ctx = chart.canvas.getContext("2d");
      if (ctx) drawLineChart(ctx, series, { width: CHART_WIDTH, height: CHART_HEIGHT });

      chart.config.series.forEach((s, i) => {
        const valueEl = chart.legendValueEls[i];
        if (!valueEl) return;
        const value = last ? (metricSeries([last], s.column)[0] ?? 0) : 0;
        valueEl.textContent = last ? formatMetricValue(value) : "—";
      });
    }
  }

  redraw();
  const unsubscribe = onMetricsRow(() => redraw());

  return {
    el: root,
    dispose(): void {
      unsubscribe();
    },
  };
}
