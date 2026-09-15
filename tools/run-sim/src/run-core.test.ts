/**
 * Unit tests for `fingerprint`/`describeDivergence` (audit-05) — pure
 * functions over hand-built `RunResult` objects, no sim boot. `fingerprint`
 * used to go through bare `JSON.stringify`, which coerces
 * Infinity/-Infinity/NaN all to `null` and renders `-0` as `0`, so a real
 * float-drift nondeterminism bug in exactly those shapes would fingerprint
 * identically and the determinism check would falsely pass. These tests
 * pin the fix: each non-finite/`-0` case must fingerprint DIFFERENT from
 * its finite counterpart, while two genuinely identical results must still
 * fingerprint EQUAL (no false alarms).
 */
import { describe, it, expect } from "vitest";
import { fingerprint, describeDivergence, type RunResult, type FarmerSummary } from "./run-core";

function makeFarmer(overrides: Partial<FarmerSummary> = {}): FarmerSummary {
  return {
    id: 1,
    name: "Pip",
    personality: "conservative",
    gold: 100,
    crops: { wheat: 3 },
    unsoldValue: 10,
    livestockValue: 0,
    assetValue: 5,
    totalValue: 115,
    ...overrides,
  };
}

function makeResult(gold: number): RunResult {
  const farmer = makeFarmer({ gold });
  return {
    perDay: [{ day: 0, weather: "normal", summaries: [farmer] }],
    finalDay: 0,
    finalWeather: "normal",
    finalStandings: [farmer],
  };
}

describe("fingerprint — non-finite and -0 discrimination", () => {
  it("fingerprints Infinity and -Infinity in the same leaf field as DIFFERENT", () => {
    const a = makeResult(Infinity);
    const b = makeResult(-Infinity);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("fingerprints NaN and Infinity in the same leaf field as DIFFERENT", () => {
    const a = makeResult(NaN);
    const b = makeResult(Infinity);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("fingerprints -0 and 0 in the same leaf field as DIFFERENT", () => {
    const a = makeResult(-0);
    const b = makeResult(0);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("still fingerprints two genuinely identical results as EQUAL (no false alarms)", () => {
    const a = makeResult(42);
    const b = makeResult(42);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("still fingerprints identical results carrying Infinity/NaN/-0 as EQUAL", () => {
    const a = makeResult(Infinity);
    const b = makeResult(Infinity);
    expect(fingerprint(a)).toBe(fingerprint(b));

    const c = makeResult(NaN);
    const d = makeResult(NaN);
    expect(fingerprint(c)).toBe(fingerprint(d));

    const e = makeResult(-0);
    const f = makeResult(-0);
    expect(fingerprint(e)).toBe(fingerprint(f));
  });

  it("does not confuse a legitimate string equal to a sentinel with an actual non-finite value", () => {
    const a = makeResult(100); // finite gold
    const withSentinelName = makeResult(100);
    withSentinelName.finalStandings[0]!.name = "__NaN";
    withSentinelName.perDay[0]!.summaries[0]!.name = "__NaN";
    // A real NaN in gold must still fingerprint differently from a plain
    // finite result whose NAME happens to collide with the NaN sentinel.
    const realNaN = makeResult(NaN);
    expect(fingerprint(withSentinelName)).not.toBe(fingerprint(realNaN));
    expect(fingerprint(withSentinelName)).not.toBe(fingerprint(a));
  });
});

describe("describeDivergence — legible reporting for non-finite mismatches", () => {
  it("names the field and both values for an Infinity vs -Infinity mismatch", () => {
    const a = makeResult(Infinity);
    const b = makeResult(-Infinity);
    const report = describeDivergence(a, b);
    expect(report).toContain("gold");
    expect(report).toContain("Infinity");
    expect(report).toContain("-Infinity");
    // Must not degrade to the old "null" vs "null" non-report.
    expect(report).not.toContain("run A: null");
    expect(report).not.toContain("run B: null");
  });

  it("names the field and both values for a -0 vs 0 mismatch", () => {
    const a = makeResult(-0);
    const b = makeResult(0);
    const report = describeDivergence(a, b);
    expect(report).toContain("gold");
    expect(report).toContain("-0");
  });

  it("reports no divergence text difference for identical results (guarded via fingerprint equality)", () => {
    const a = makeResult(7);
    const b = makeResult(7);
    // describeDivergence assumes callers only invoke it once fingerprints
    // differ; sanity-check the precondition holds for equal inputs.
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});
