/**
 * The policy gate (chunk hollow-13) — which decisions are worth a
 * consultation. Small surface, but it decides the seam's entire cost
 * profile, so the significant-verb set is pinned here explicitly rather than
 * left to drift.
 */
import { describe, it, expect } from "vitest";
import type { ScoredChoice } from "../agents/social-verbs";
import { SIGNIFICANT_SOCIAL_VERBS, isSignificantDecision } from "./policy";

function choice(kind: string, score = 0.7): ScoredChoice {
  return { kind, score, data: {} };
}

describe("SIGNIFICANT_SOCIAL_VERBS", () => {
  it("is exactly the antagonistic four plus trade", () => {
    expect([...SIGNIFICANT_SOCIAL_VERBS].sort()).toEqual(["attack", "rumor", "sabotage", "steal", "trade"]);
  });

  it("excludes the high-frequency, low-stakes prosocial verbs", () => {
    for (const kind of ["gift", "share", "help_labor", "teach"]) {
      expect(SIGNIFICANT_SOCIAL_VERBS.has(kind)).toBe(false);
    }
  });
});

describe("isSignificantDecision", () => {
  it("is false for an empty set (nothing to choose among)", () => {
    expect(isSignificantDecision([])).toBe(false);
  });

  it("is false when only prosocial verbs are on the table", () => {
    expect(isSignificantDecision([choice("gift"), choice("teach"), choice("help_labor"), choice("share")])).toBe(false);
  });

  it("is true when a significant verb is AVAILABLE, even if it is not the default", () => {
    // The seam exists so the model can pick something the substrate ranked
    // second — so availability, not the substrate's own pick, is the trigger.
    const candidates = [choice("gift", 0.9), choice("steal", 0.61)];
    expect(isSignificantDecision(candidates)).toBe(true);
  });

  it("is true for each significant verb on its own", () => {
    for (const kind of SIGNIFICANT_SOCIAL_VERBS) {
      expect(isSignificantDecision([choice(kind)])).toBe(true);
    }
  });

  it("does not mutate the candidate set it inspects", () => {
    const candidates = [choice("gift"), choice("steal")];
    const before = JSON.stringify(candidates);
    isSignificantDecision(candidates);
    expect(JSON.stringify(candidates)).toBe(before);
  });
});
