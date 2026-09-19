import { describe, it, expect } from "vitest";
import { ONT_RATIONALIZE } from "@hollow/sim-core/observe";
import type { ChronicleEvent } from "@hollow/sim-core/observe";
import {
  summarizeRationalizerDecisions,
  formatRationalizerSummary,
} from "./rationalizer-summary";

/** One flat `rationalize.decision` chronicle row, shaped exactly as
 *  `captureRationalizerDecisions` pushes it (no `body` wrapper). */
function decision(over: Partial<Record<string, unknown>> = {}): ChronicleEvent {
  return {
    tick: 50,
    ontology: ONT_RATIONALIZE.DECISION,
    agentId: 1,
    requestTick: 10,
    provider: "contrarian",
    outcome: "rejected",
    reason: "stale-candidates",
    rationale: "",
    bdiKind: "trade",
    chosenKind: "trade",
    ...over,
  } as ChronicleEvent;
}

describe("summarizeRationalizerDecisions", () => {
  it("returns null when the run used no seam, so a RATIONALIZER=off summary prints nothing", () => {
    expect(summarizeRationalizerDecisions([])).toBeNull();
    expect(
      summarizeRationalizerDecisions([{ tick: 1, ontology: "social.gift" } as ChronicleEvent]),
    ).toBeNull();
  });

  it("counts every outcome and reports adoption as a percentage of consultations", () => {
    const s = summarizeRationalizerDecisions([
      decision({ outcome: "adopted", reason: null, chosenKind: "steal" }),
      decision({ outcome: "kept-default", reason: null }),
      decision({ outcome: "declined", reason: null }),
      decision(),
    ]);
    expect(s).not.toBeNull();
    expect(s!.consultations).toBe(4);
    expect(s!.adopted).toBe(1);
    expect(s!.keptDefault).toBe(1);
    expect(s!.declined).toBe(1);
    expect(s!.rejected).toBe(1);
    expect(s!.adoptionPct).toBeCloseTo(25);
  });

  it("ignores non-rationalize chronicle rows rather than counting the whole log", () => {
    const s = summarizeRationalizerDecisions([
      { tick: 1, ontology: "social.gift" } as ChronicleEvent,
      decision({ outcome: "adopted", reason: null }),
      { tick: 2, ontology: "death" } as ChronicleEvent,
    ]);
    expect(s!.consultations).toBe(1);
    expect(s!.adoptionPct).toBe(100);
  });

  it("uses the MEDIAN answer-lag, so one expired request cannot drag the figure", () => {
    const s = summarizeRationalizerDecisions([
      decision({ tick: 50, requestTick: 10 }), // 40
      decision({ tick: 92, requestTick: 51 }), // 41
      decision({ tick: 900, requestTick: 60 }), // 840 — an outlier
    ]);
    // Mean would be ~307. The 40-tick social cooldown is what pins the typical
    // wait, and that is the number worth printing.
    expect(s!.medianLagTicks).toBe(41);
  });

  it("groups rejection reasons descending by count, with a stable tiebreak", () => {
    const s = summarizeRationalizerDecisions([
      decision({ reason: "stale-candidates" }),
      decision({ reason: "stale-candidates" }),
      decision({ reason: "provider-error" }),
      decision({ reason: "out-of-range" }),
    ]);
    expect(s!.reasons).toEqual([
      ["stale-candidates", 2],
      ["out-of-range", 1],
      ["provider-error", 1],
    ]);
  });

  it("counts reasons only for rejections — an adopted row carries no reason", () => {
    const s = summarizeRationalizerDecisions([
      decision({ outcome: "adopted", reason: null }),
      decision({ reason: "stale-candidates" }),
    ]);
    expect(s!.reasons).toEqual([["stale-candidates", 1]]);
  });
});

describe("formatRationalizerSummary", () => {
  it("names the rate first, because that is the property a reader gets wrong", () => {
    const s = summarizeRationalizerDecisions([
      decision({ outcome: "adopted", reason: null }),
      decision(),
      decision(),
      decision(),
    ])!;
    expect(formatRationalizerSummary(s)[0]).toBe(
      "  rationalizer — 4 consultation(s), 1 adopted (25.0%)",
    );
  });

  it("warns explicitly when nothing was adopted — the exact case that once read as a broken seam", () => {
    const s = summarizeRationalizerDecisions([decision(), decision()])!;
    const lines = formatRationalizerSummary(s);
    expect(lines.at(-1)).toContain("identical to RATIONALIZER=off");
  });

  it("omits the note when at least one answer was adopted, since the world then genuinely differs", () => {
    const s = summarizeRationalizerDecisions([decision({ outcome: "adopted", reason: null })])!;
    expect(formatRationalizerSummary(s).join("\n")).not.toContain("identical to");
  });

  it("prints the rejection breakdown inline so 'why' never needs events.jsonl", () => {
    const s = summarizeRationalizerDecisions([
      decision({ reason: "stale-candidates" }),
      decision({ reason: "stale-candidates" }),
    ])!;
    expect(formatRationalizerSummary(s)[1]).toContain("rejected 2 (stale-candidates 2)");
  });
});
