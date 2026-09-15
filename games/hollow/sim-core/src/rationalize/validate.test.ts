/**
 * THE ANCHORING GUARANTEE (chunk hollow-13), tested hard.
 *
 * This is the file that has to earn the spec's "it CANNOT propose an action
 * not in the candidate set — enforced in code, not by prompt alone". Every
 * rejection class gets its own case, plus the shapes a real model actually
 * emits when it goes wrong: prose instead of JSON, `null`, an array, a
 * stringified number, a float index, a negative index, an index one past the
 * end, an invented extra field, and — the subtle one — a perfectly legal
 * index computed against an option set the world has since moved past.
 */
import { describe, it, expect } from "vitest";
import type { ScoredChoice } from "../agents/social-verbs";
import {
  candidateFingerprint,
  validateRationalizerResponse,
  validateRationalizerResult,
  acceptedResponse,
  RATIONALE_MAX_CHARS,
} from "./validate";
import type { RationalizerRequest, RationalizerResult } from "./types";

const CANDIDATES: readonly ScoredChoice[] = [
  { kind: "steal", score: 0.7, data: { targetId: 4, good: "food", amount: 5 } },
  { kind: "trade", score: 0.6, data: { targetId: 9, offerGood: "materials", offerAmount: 3 } },
  { kind: "gift", score: 0.5, data: { targetId: 2, good: "food", amount: 2 } },
];

function makeRequest(overrides: Partial<RationalizerRequest> = {}): RationalizerRequest {
  return {
    agentId: 1,
    tick: 100,
    genome: { behavior: {}, aptitude: {}, appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" } },
    beliefs: {},
    needs: {},
    relationships: [],
    standing: { communityId: null, memberCount: 0, standing: null, isLeader: false },
    candidates: CANDIDATES.map((c, index) => ({ index, kind: c.kind, data: c.data, score: c.score })),
    bdiChoiceIndex: 0,
    candidateFingerprint: candidateFingerprint(CANDIDATES),
    ...overrides,
  };
}

function makeResult(response: unknown, overrides: Partial<RationalizerResult> = {}): RationalizerResult {
  return { request: makeRequest(), response, ...overrides };
}

describe("candidateFingerprint", () => {
  it("is stable for the same candidate set", () => {
    expect(candidateFingerprint(CANDIDATES)).toBe(candidateFingerprint(CANDIDATES));
  });

  it("changes when a target changes", () => {
    const moved: ScoredChoice[] = [{ ...CANDIDATES[0]!, data: { targetId: 5, good: "food", amount: 5 } }, ...CANDIDATES.slice(1)];
    expect(candidateFingerprint(moved)).not.toBe(candidateFingerprint(CANDIDATES));
  });

  it("changes when a score changes", () => {
    const rescored: ScoredChoice[] = [{ ...CANDIDATES[0]!, score: 0.70001 }, ...CANDIDATES.slice(1)];
    expect(candidateFingerprint(rescored)).not.toBe(candidateFingerprint(CANDIDATES));
  });

  it("changes when a verb drops out of the set", () => {
    expect(candidateFingerprint(CANDIDATES.slice(1))).not.toBe(candidateFingerprint(CANDIDATES));
  });

  it("is independent of key insertion order within a candidate's data", () => {
    const reordered: ScoredChoice[] = [
      { kind: "steal", score: 0.7, data: { amount: 5, good: "food", targetId: 4 } },
      ...CANDIDATES.slice(1),
    ];
    expect(candidateFingerprint(reordered)).toBe(candidateFingerprint(CANDIDATES));
  });

  it("is empty-set safe", () => {
    expect(candidateFingerprint([])).toBe("");
  });
});

describe("validateRationalizerResponse — ACCEPTED shapes", () => {
  it("accepts an in-range integer index", () => {
    const outcome = validateRationalizerResponse({ choiceIndex: 1, rationale: "they have food" }, CANDIDATES.length);
    expect(outcome).toEqual({ accepted: true, choiceIndex: 1, rationale: "they have food" });
  });

  it("accepts index 0 and the last index (boundaries)", () => {
    expect(validateRationalizerResponse({ choiceIndex: 0, rationale: "" }, CANDIDATES.length).accepted).toBe(true);
    expect(validateRationalizerResponse({ choiceIndex: 2, rationale: "" }, CANDIDATES.length).accepted).toBe(true);
  });

  it("accepts an explicit null as 'keep the BDI default'", () => {
    const outcome = validateRationalizerResponse({ choiceIndex: null, rationale: "no view" }, CANDIDATES.length);
    expect(outcome).toEqual({ accepted: true, choiceIndex: null, rationale: "no view" });
  });

  it("ignores extra fields rather than rejecting the whole answer", () => {
    const outcome = validateRationalizerResponse(
      { choiceIndex: 2, rationale: "kind", confidence: 0.9, action: "burn the village" },
      CANDIDATES.length,
    );
    // The invented `action` field is simply not read — there is no path from
    // it into the sim. That is the point of an index-only response.
    expect(outcome).toEqual({ accepted: true, choiceIndex: 2, rationale: "kind" });
  });

  it("truncates a rambling rationale instead of rejecting it", () => {
    const outcome = validateRationalizerResponse({ choiceIndex: 0, rationale: "x".repeat(5000) }, CANDIDATES.length);
    expect(outcome.accepted).toBe(true);
    expect(acceptedResponse(outcome)!.rationale).toHaveLength(RATIONALE_MAX_CHARS);
  });
});

describe("validateRationalizerResponse — REJECTION classes", () => {
  it("rejects an out-of-range index (the 'propose an illegal action' attempt)", () => {
    for (const bad of [3, 4, 99, 1000]) {
      const outcome = validateRationalizerResponse({ choiceIndex: bad, rationale: "r" }, CANDIDATES.length);
      expect(outcome).toMatchObject({ accepted: false, reason: "index-out-of-range" });
    }
  });

  it("rejects a negative index", () => {
    // Negative lands in `non-integer-index` (it fails the >= 0 test, which is
    // part of "is this usable as an array index at all") — the class name
    // matters less than that it never reaches the candidate array.
    expect(validateRationalizerResponse({ choiceIndex: -1, rationale: "r" }, CANDIDATES.length)).toMatchObject({
      accepted: false,
      reason: "non-integer-index",
    });
  });

  it("rejects a non-integer index", () => {
    for (const bad of [1.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY, -0.5]) {
      expect(validateRationalizerResponse({ choiceIndex: bad, rationale: "r" }, CANDIDATES.length)).toMatchObject({
        accepted: false,
        reason: "non-integer-index",
      });
    }
  });

  it("rejects a malformed shape", () => {
    const malformed: readonly unknown[] = [
      null,
      undefined,
      "I think agent 4 should be robbed",
      42,
      true,
      [],
      [{ choiceIndex: 0, rationale: "r" }],
      {},
      { rationale: "r" }, // no choiceIndex
      { choiceIndex: 0 }, // no rationale
      { choiceIndex: "1", rationale: "r" }, // stringified index
      { choiceIndex: 0, rationale: 7 }, // non-string rationale
    ];
    for (const raw of malformed) {
      const outcome = validateRationalizerResponse(raw, CANDIDATES.length);
      expect(outcome.accepted, `expected rejection for ${JSON.stringify(raw)}`).toBe(false);
    }
  });

  it("rejects every index against an EMPTY candidate set", () => {
    expect(validateRationalizerResponse({ choiceIndex: 0, rationale: "r" }, 0)).toMatchObject({
      accepted: false,
      reason: "index-out-of-range",
    });
    // …but "keep the default" is still a legal answer with nothing on offer.
    expect(validateRationalizerResponse({ choiceIndex: null, rationale: "r" }, 0).accepted).toBe(true);
  });
});

describe("validateRationalizerResult — identity, staleness, provider errors", () => {
  it("accepts a well-formed result against the live set", () => {
    const outcome = validateRationalizerResult(makeResult({ choiceIndex: 1, rationale: "r" }), 1, CANDIDATES);
    // `offeredIndex` is what the model named; `choiceIndex` is where that same
    // option sits in the LIVE set — here, unchanged, so they agree.
    expect(outcome).toEqual({ accepted: true, choiceIndex: 1, offeredIndex: 1, rationale: "r" });
  });

  it("rejects a result for a different agent", () => {
    expect(validateRationalizerResult(makeResult({ choiceIndex: 1, rationale: "r" }), 2, CANDIDATES)).toMatchObject({
      accepted: false,
      reason: "wrong-agent",
    });
  });

  it("rejects a STALE result — a legal index against an option set that has changed", () => {
    // The answer itself is impeccable: index 1 is in range of the live set
    // too. But the live set's index 1 is no longer the option the model was
    // shown, so adopting it would apply a reasoned choice to an unreasoned
    // action. Rejected.
    const live: ScoredChoice[] = [
      CANDIDATES[0]!,
      { kind: "attack", score: 0.65, data: { targetId: 11 } },
      CANDIDATES[2]!,
    ];
    const outcome = validateRationalizerResult(makeResult({ choiceIndex: 1, rationale: "r" }), 1, live);
    expect(outcome).toMatchObject({ accepted: false, reason: "stale-candidates" });
  });

  it("rejects when the CHOSEN verb has dropped out of the live set", () => {
    // The model picked index 2 (`gift`). The live set no longer offers it —
    // the substrate re-checked feasibility and `gift` didn't clear. Rejected,
    // even though index 2's disappearance leaves the other two intact.
    const outcome = validateRationalizerResult(
      makeResult({ choiceIndex: 2, rationale: "r" }),
      1,
      CANDIDATES.slice(0, 2),
    );
    expect(outcome).toMatchObject({ accepted: false, reason: "stale-candidates" });
  });

  it("ACCEPTS when the chosen option survives, and re-resolves its index in the live set", () => {
    // This is the anchoring rule doing its real job: the option set has been
    // reshuffled and re-scored, but "trade with 9" is still on the table — at
    // index 0 now, not 1. The returned index points at the LIVE array, so the
    // adopted action is the one that was reasoned about, not whatever happens
    // to sit at the old position.
    const live: ScoredChoice[] = [
      { ...CANDIDATES[1]!, score: 0.31 }, // same option, drifted score, moved
      { kind: "attack", score: 0.9, data: { targetId: 11 } },
      CANDIDATES[0]!,
    ];
    const outcome = validateRationalizerResult(makeResult({ choiceIndex: 1, rationale: "r" }), 1, live);
    expect(outcome).toEqual({ accepted: true, choiceIndex: 0, offeredIndex: 1, rationale: "r" });
  });

  it("strictCandidateSet additionally rejects ANY change to the set, score drift included", () => {
    const drifted: ScoredChoice[] = [{ ...CANDIDATES[0]!, score: 0.700001 }, ...CANDIDATES.slice(1)];
    // Lenient (the default): the chosen option is still there, so it stands.
    expect(validateRationalizerResult(makeResult({ choiceIndex: 1, rationale: "r" }), 1, drifted).accepted).toBe(true);
    // Strict: a single decimal of score drift anywhere in the set is stale.
    expect(
      validateRationalizerResult(makeResult({ choiceIndex: 1, rationale: "r" }), 1, drifted, {
        strictCandidateSet: true,
      }),
    ).toMatchObject({ accepted: false, reason: "stale-candidates" });
  });

  it("rejects a provider error before looking at the body at all", () => {
    const outcome = validateRationalizerResult(
      makeResult({ choiceIndex: 1, rationale: "r" }, { error: "timeout after 30s" }),
      1,
      CANDIDATES,
    );
    expect(outcome).toMatchObject({ accepted: false, reason: "provider-error", detail: "timeout after 30s" });
  });

  it("never throws, whatever the body is", () => {
    const hostile: readonly unknown[] = [undefined, null, NaN, Symbol("x"), () => 0, new Map(), { choiceIndex: {} }];
    for (const raw of hostile) {
      expect(() => validateRationalizerResult(makeResult(raw), 1, CANDIDATES)).not.toThrow();
    }
  });
});
