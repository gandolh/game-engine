/**
 * Tiny end-to-end proof for the research CLI's wiring (chunk hollow-07) —
 * NOT a heavy multi-thousand-tick sweep (see this file's brief: "do NOT add
 * a heavy... test"). A short run at the default research profile is enough
 * to prove metrics/events/lineage actually flow out of a real
 * `bootstrapHollowSim` loop, not just that the pure helpers in
 * `metrics.test.ts`/`export.test.ts` compute correctly in isolation.
 */
import { describe, it, expect } from "vitest";
import { runResearch } from "./run-core";
import { RESEARCH_PROFILE } from "./env";
import { metricsCsv, METRICS_COLUMNS } from "./export";

describe("runResearch — tiny end-to-end wiring proof", () => {
  it("produces a metrics time series, a non-empty chronicle, and a lineage with real descent, in ~300 ticks", () => {
    const result = runResearch({
      simOptions: { seed: 7, ...RESEARCH_PROFILE },
      ticksPerYear: 50,
      maxYears: 6, // 300 ticks total
    });

    // metrics.csv: fixed header + more than one data row (year 0 baseline +
    // at least one real sample).
    const csv = metricsCsv(result.metricsRows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(METRICS_COLUMNS.join(","));
    expect(lines.length).toBeGreaterThan(2); // header + >1 data row
    expect(result.metricsRows.length).toBe(7); // years 0..6 inclusive

    // events.jsonl: the chronicle actually captured something (this profile
    // has active social verbs from tick 0).
    expect(result.events.length).toBeGreaterThan(0);

    // lineage.json: real records, sorted, with actual multi-generation
    // descent (not just the founder gen-0 population).
    expect(result.lineage.length).toBeGreaterThan(0);
    const ids = result.lineage.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(result.summary.generationsOfDescent).toBeGreaterThanOrEqual(1);

    // Not a decorative no-op: real dynamics happened.
    expect(result.summary.totalBirths).toBeGreaterThan(0);
  });

  it("is byte-identical across two fresh runs with the same seed+options (determinism)", () => {
    const opts = { simOptions: { seed: 42, ...RESEARCH_PROFILE }, ticksPerYear: 50, maxYears: 4 };
    const a = runResearch(opts);
    const b = runResearch(opts);
    expect(JSON.stringify(a.metricsRows)).toBe(JSON.stringify(b.metricsRows));
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(JSON.stringify(a.lineage)).toBe(JSON.stringify(b.lineage));
  });
});
