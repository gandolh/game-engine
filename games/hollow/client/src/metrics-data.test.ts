import { describe, it, expect } from "vitest";
import type { MetricsRow } from "@hollow/sim-core/observe";
import { metricSeries, chartScale, formatMetricValue } from "./metrics-data";

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

describe("metricSeries", () => {
  it("extracts a plain top-level column across rows, in row order", () => {
    const rows = [row({ population: 8 }), row({ population: 9 }), row({ population: 7 })];
    expect(metricSeries(rows, "population")).toEqual([8, 9, 7]);
  });

  it("extracts a flattened mean_gene_<name> column", () => {
    const rows = [row({ genes: { sociability: 0.5 } }), row({ genes: { sociability: 0.6 } })];
    expect(metricSeries(rows, "mean_gene_sociability")).toEqual([0.5, 0.6]);
  });

  it("reads 0 for a nonexistent column, for every row", () => {
    const rows = [row(), row()];
    expect(metricSeries(rows, "not_a_real_column")).toEqual([0, 0]);
  });

  it("returns an empty array for an empty input", () => {
    expect(metricSeries([], "population")).toEqual([]);
  });
});

describe("chartScale", () => {
  it("returns the exact min/max for a varying series", () => {
    expect(chartScale([3, 1, 4, 1, 5])).toEqual({ min: 1, max: 5 });
  });

  it("returns a fixed [0,1] placeholder for an empty series", () => {
    expect(chartScale([])).toEqual({ min: 0, max: 1 });
  });

  it("pads a flat nonzero series into a visible band centered on the value", () => {
    const scale = chartScale([4, 4, 4]);
    expect(scale.min).toBeLessThan(4);
    expect(scale.max).toBeGreaterThan(4);
    expect(scale.min + scale.max).toBeCloseTo(8); // symmetric around 4
  });

  it("pads a flat all-zero series into a nonzero band", () => {
    const scale = chartScale([0, 0]);
    expect(scale.min).toBeLessThan(0);
    expect(scale.max).toBeGreaterThan(0);
  });

  it("never returns a zero-width range for any nonempty input", () => {
    for (const values of [[5], [5, 5, 5], [-2, -2], [0], [1, 2, 3]]) {
      const scale = chartScale(values);
      expect(scale.max).toBeGreaterThan(scale.min);
    }
  });
});

describe("formatMetricValue", () => {
  it("prints whole numbers plain", () => {
    expect(formatMetricValue(8)).toBe("8");
    expect(formatMetricValue(0)).toBe("0");
  });

  it("prints fractional numbers to 2 decimal places", () => {
    expect(formatMetricValue(0.3421)).toBe("0.34");
    expect(formatMetricValue(1.5)).toBe("1.50");
  });
});
