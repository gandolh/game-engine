/**
 * Tiny end-to-end proof for the research CLI's wiring (chunk hollow-07) —
 * NOT a heavy multi-thousand-tick sweep (see this file's brief: "do NOT add
 * a heavy... test"). A short run at the default research profile is enough
 * to prove metrics/events/lineage actually flow out of a real
 * `bootstrapHollowSim` loop, not just that the pure helpers in
 * `metrics.test.ts`/`export.test.ts` compute correctly in isolation.
 */
import { describe, it, expect } from "vitest";
import { runResearch, type RunResult, type RunSummary } from "./run-core";
import { RESEARCH_PROFILE } from "./env";
import { metricsCsv, METRICS_COLUMNS } from "./export";
import { fingerprint, describeDivergence } from "./determinism";
import type { MetricsRow, ChronicleEvent } from "@hollow/sim-core/observe";
import type { LineageEntry } from "@hollow/sim-core/lineage";

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

/**
 * audit-05 — `fingerprint`/`describeDivergence` (./determinism) unit tests.
 * Pure functions over HAND-BUILT `RunResult` objects, no sim boot — these
 * must run in milliseconds. `wealth_gini` is a real division-derived float
 * in `MetricsRow` (see observe/metrics.ts), so it stands in for the class of
 * bug this tool exists to catch: a genuine float-drift nondeterminism that
 * flips a metric between Infinity/-Infinity/NaN/-0 and its finite twin.
 * Before the fix, bare `JSON.stringify` collapsed all of those to `null`/`0`
 * and the check would falsely pass.
 */
function makeMetricsRow(wealthGini: number): MetricsRow {
  return {
    tick: 0,
    year: 0,
    population: 10,
    births_cum: 0,
    births_window: 0,
    deaths_window: 0,
    deaths_oldAge_window: 0,
    deaths_starvation_window: 0,
    deaths_violence_window: 0,
    community_count: 0,
    community_mean_size: 0,
    mean_pairwise_trust: 0,
    wealth_gini: wealthGini,
    coop_window: 0,
    antag_window: 0,
    genes: { sociability: 0.5 },
  };
}

function makeEvent(): ChronicleEvent {
  return { tick: 0, ontology: "test-event" };
}

function makeLineageEntry(): LineageEntry {
  return {
    id: 1,
    genome: {
      behavior: { sociability: 0.5 },
      aptitude: { food: 0.5 },
      appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBrown" },
    },
    parents: null,
    birthTick: 0,
    deathTick: null,
    deathCause: null,
    communityHistory: [],
  };
}

const STUB_SUMMARY: RunSummary = {
  seed: 1,
  ticksRun: 1,
  generationsOfDescent: 0,
  finalPopulation: 10,
  totalBirths: 0,
  deathsByCause: { oldAge: 0, starvation: 0, violence: 0, disease: 0 },
  totalCoopEvents: 0,
  totalAntagEvents: 0,
  communitiesFormed: 0,
  communitiesDissolved: 0,
};

function makeRunResult(wealthGini: number): RunResult {
  return {
    metricsRows: [makeMetricsRow(wealthGini)],
    events: [makeEvent()],
    lineage: [makeLineageEntry()],
    summary: STUB_SUMMARY,
  };
}

describe("determinism.fingerprint — non-finite and -0 discrimination (audit-05)", () => {
  it("fingerprints Infinity and -Infinity in the same leaf field as DIFFERENT", () => {
    const a = makeRunResult(Infinity);
    const b = makeRunResult(-Infinity);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("fingerprints NaN and Infinity in the same leaf field as DIFFERENT", () => {
    const a = makeRunResult(NaN);
    const b = makeRunResult(Infinity);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("fingerprints -0 and 0 in the same leaf field as DIFFERENT", () => {
    const a = makeRunResult(-0);
    const b = makeRunResult(0);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("still fingerprints two genuinely identical results as EQUAL (no false alarms)", () => {
    const a = makeRunResult(0.42);
    const b = makeRunResult(0.42);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("still fingerprints identical non-finite/-0 results as EQUAL", () => {
    expect(fingerprint(makeRunResult(Infinity))).toBe(fingerprint(makeRunResult(Infinity)));
    expect(fingerprint(makeRunResult(NaN))).toBe(fingerprint(makeRunResult(NaN)));
    expect(fingerprint(makeRunResult(-0))).toBe(fingerprint(makeRunResult(-0)));
  });
});

describe("determinism.describeDivergence — legible reporting (audit-05)", () => {
  it("names the field and both values for an Infinity vs -Infinity mismatch", () => {
    const report = describeDivergence(makeRunResult(Infinity), makeRunResult(-Infinity));
    expect(report).toContain("wealth_gini");
    expect(report).toContain("Infinity");
    expect(report).toContain("-Infinity");
    expect(report).not.toContain("run A: null");
    expect(report).not.toContain("run B: null");
  });

  it("names the field and both values for a -0 vs 0 mismatch", () => {
    const report = describeDivergence(makeRunResult(-0), makeRunResult(0));
    expect(report).toContain("wealth_gini");
    expect(report).toContain("-0");
  });
});
