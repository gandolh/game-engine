import { describe, it, expect, afterEach } from "vitest";
import type { MetricsRow } from "@hollow/sim-core/observe";
import { ingestMetricsRow, resetResearchStore } from "./research-store";
import { createDashboardPanel } from "./dashboard-panel";

afterEach(() => {
  resetResearchStore();
});

function row(overrides: Partial<MetricsRow> = {}): MetricsRow {
  return {
    tick: 0,
    year: 0,
    population: 8,
    births_cum: 0,
    births_window: 0,
    deaths_window: 0,
    deaths_oldAge_window: 0,
    deaths_starvation_window: 0,
    deaths_violence_window: 0,
    community_count: 0,
    community_mean_size: 0,
    mean_pairwise_trust: 0,
    wealth_gini: 0,
    coop_window: 0,
    antag_window: 0,
    genes: {},
    ...overrides,
  };
}

describe("createDashboardPanel", () => {
  it("builds one chart panel per configured metric group, each with a canvas + legend", () => {
    const panel = createDashboardPanel();
    const charts = panel.el.querySelectorAll(".hollow-dashboard-chart");
    expect(charts.length).toBeGreaterThanOrEqual(6);
    expect(panel.el.querySelectorAll("canvas.hollow-dashboard-canvas").length).toBe(charts.length);
    expect(panel.el.textContent).toContain("Population");
    expect(panel.el.textContent).toContain("Gene drift");
  });

  it("shows a placeholder legend value with no rows yet", () => {
    const panel = createDashboardPanel();
    const values = panel.el.querySelectorAll(".hollow-dashboard-legend-value");
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]!.textContent).toBe("—");
  });

  it("renders the backlog's latest row's values on mount", () => {
    ingestMetricsRow(row({ population: 8 }));
    ingestMetricsRow(row({ population: 12 }));
    const panel = createDashboardPanel();
    // "Population" is the first chart config -> its sole legend value.
    const firstValue = panel.el.querySelector(".hollow-dashboard-legend-value");
    expect(firstValue!.textContent).toBe("12");
  });

  it("updates legend values live as new metrics rows arrive, without rebuilding the chart DOM", () => {
    ingestMetricsRow(row({ population: 8 }));
    const panel = createDashboardPanel();
    const chartsBefore = panel.el.querySelectorAll(".hollow-dashboard-chart").length;

    ingestMetricsRow(row({ population: 20 }));

    const chartsAfter = panel.el.querySelectorAll(".hollow-dashboard-chart").length;
    expect(chartsAfter).toBe(chartsBefore); // same DOM nodes, not rebuilt

    const firstValue = panel.el.querySelector(".hollow-dashboard-legend-value");
    expect(firstValue!.textContent).toBe("20");
  });

  it("dispose() stops further live updates", () => {
    ingestMetricsRow(row({ population: 8 }));
    const panel = createDashboardPanel();
    panel.dispose();
    ingestMetricsRow(row({ population: 99 }));
    const firstValue = panel.el.querySelector(".hollow-dashboard-legend-value");
    expect(firstValue!.textContent).toBe("8");
  });

  it("does not throw even though jsdom has no real 2D canvas rendering", () => {
    ingestMetricsRow(row());
    expect(() => createDashboardPanel()).not.toThrow();
  });
});
