/**
 * The prompt-keyed response cache (chunk hollow-13), tested at two altitudes:
 *
 *  - direct unit tests on `deriveCacheKey` and `createReplayingRationalizer`
 *    (no sim), pinning down exactly what is and isn't part of the key, and
 *    the FIFO-per-key + explicit-miss behavior the header in `cache.ts`
 *    argues for; and
 *  - a full `bootstrapHollowSim` round trip — record a run through the
 *    stub, replay it from the recording, and prove the replay is
 *    byte-identical to the recorded run AND never touches the wrapped
 *    provider again. Reuses the `run()`/`PROFILE` shape from
 *    `seam.test.ts` (duplicated here rather than imported: that file has no
 *    exports and this chunk must not edit it).
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSimOptions } from "../sim-bootstrap";
import { createStubRationalizer } from "./stub";
import type { Rationalizer, RationalizerRequest } from "./types";
import type { RationalizerDecision } from "./seam";
import {
  createRecordingRationalizer,
  createReplayingRationalizer,
  deriveCacheKey,
  isCacheMissError,
  type RationalizerCacheData,
} from "./cache";

// ── direct unit tests (no sim) ─────────────────────────────────────────────

function makeRequest(overrides: Partial<RationalizerRequest> = {}): RationalizerRequest {
  return {
    agentId: 1,
    tick: 100,
    genome: { behavior: { greed: 0.4 }, aptitude: {}, appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" } },
    beliefs: {},
    needs: { food: 0.5 },
    relationships: [],
    standing: { communityId: null, memberCount: 0, standing: null, isLeader: false },
    candidates: [
      { index: 0, kind: "steal", data: { targetId: 4, good: "food", amount: 5 }, score: 0.7 },
      { index: 1, kind: "gift", data: { targetId: 2, good: "food", amount: 2 }, score: 0.5 },
    ],
    bdiChoiceIndex: 0,
    candidateFingerprint: "unused-by-deriveCacheKey",
    ...overrides,
  };
}

describe("deriveCacheKey", () => {
  it("is stable for identical decision content", () => {
    expect(deriveCacheKey(makeRequest())).toBe(deriveCacheKey(makeRequest()));
  });

  it("ignores `tick` — the same decision at two different ticks is one key", () => {
    expect(deriveCacheKey(makeRequest({ tick: 1 }))).toBe(deriveCacheKey(makeRequest({ tick: 999_999 })));
  });

  it("ignores `agentId` — two agents facing the identical situation share a key", () => {
    expect(deriveCacheKey(makeRequest({ agentId: 1 }))).toBe(deriveCacheKey(makeRequest({ agentId: 2 })));
  });

  it("changes when the candidate set differs", () => {
    const other = makeRequest({
      candidates: [{ index: 0, kind: "steal", data: { targetId: 4, good: "food", amount: 999 }, score: 0.7 }],
    });
    expect(deriveCacheKey(makeRequest())).not.toBe(deriveCacheKey(other));
  });

  it("changes when the BDI default differs", () => {
    expect(deriveCacheKey(makeRequest({ bdiChoiceIndex: 0 }))).not.toBe(deriveCacheKey(makeRequest({ bdiChoiceIndex: 1 })));
  });

  it("changes when needs, beliefs, relationships or standing differ", () => {
    const base = deriveCacheKey(makeRequest());
    expect(deriveCacheKey(makeRequest({ needs: { food: 0.9 } }))).not.toBe(base);
    expect(deriveCacheKey(makeRequest({ beliefs: { starving: true } }))).not.toBe(base);
    expect(
      deriveCacheKey(
        makeRequest({
          relationships: [{ peerId: 4, trust: 0.9, grudge: 0, sameHousehold: false, sameCommunity: true, isCandidateTarget: true }],
        }),
      ),
    ).not.toBe(base);
    expect(deriveCacheKey(makeRequest({ standing: { communityId: 3, memberCount: 5, standing: 0.2, isLeader: true } }))).not.toBe(base);
  });
});

describe("createReplayingRationalizer", () => {
  it("serves recorded responses FIFO per key, echoes the request verbatim, and misses explicitly once the queue is empty", () => {
    const reqA = makeRequest({ agentId: 1 });
    const reqB = makeRequest({ agentId: 2 }); // identical content, different agent -> SAME key by design
    const reqC = makeRequest({ agentId: 3, tick: 555 }); // identical content again -> same key, third occurrence
    const key = deriveCacheKey(reqA);
    const data: RationalizerCacheData = {
      version: 1,
      entries: {
        [key]: [{ response: { choiceIndex: 0, rationale: "first" } }, { response: { choiceIndex: null, rationale: "second" } }],
      },
    };
    const replay = createReplayingRationalizer(data);

    replay.submit(reqA);
    replay.submit(reqB);
    replay.submit(reqC); // the queue for `key` only had two entries
    const results = replay.poll();

    expect(results).toHaveLength(3);
    expect(results[0]?.request).toBe(reqA); // echoed verbatim, not a copy
    expect(results[0]?.response).toEqual({ choiceIndex: 0, rationale: "first" });
    expect(results[0]?.error).toBeUndefined();
    expect(results[1]?.request).toBe(reqB);
    expect(results[1]?.response).toEqual({ choiceIndex: null, rationale: "second" });
    expect(results[2]?.request).toBe(reqC);
    expect(isCacheMissError(results[2]?.error)).toBe(true);

    expect(replay.missCount).toBe(1);
    expect(replay.missedKeys).toEqual([key]);

    // poll() drains — nothing left to hand back a second time.
    expect(replay.poll()).toHaveLength(0);
  });

  it("round-trips through JSON.parse(JSON.stringify(...)) with identical replay behavior", () => {
    const req = makeRequest();
    const key = deriveCacheKey(req);
    const data: RationalizerCacheData = { version: 1, entries: { [key]: [{ response: { choiceIndex: 1, rationale: "r" } }] } };
    const roundTripped: RationalizerCacheData = JSON.parse(JSON.stringify(data));

    const replay = createReplayingRationalizer(roundTripped);
    replay.submit(req);
    const [result] = replay.poll();
    expect(result?.response).toEqual({ choiceIndex: 1, rationale: "r" });
    expect(result?.error).toBeUndefined();
  });
});

// ── full-sim round trip ─────────────────────────────────────────────────────

/** Same shrunk research profile as seam.test.ts — small population, short
 *  run (constrained hardware: CLAUDE.md). */
const PROFILE: HollowSimOptions = {
  seed: 1,
  population: 20,
  ticksPerDay: 20,
  childAdultTicks: 15,
  adultElderTicks: 200,
  oldAgeHazardBase: 0.006,
  oldAgeHazardPerTick: 0.0012,
  oldAgeHazardMax: 0.2,
  starvationDeathTicks: 120,
  pairbondTrustThreshold: 0.55,
  pairbondCompatThreshold: 0.2,
  pairbondProximityTiles: 12,
  birthWindowTicks: 20,
  birthChance: 0.6,
  birthFoodSecurityFraction: 0.3,
  gestationTicks: 10,
  birthPerCapitaFoodTarget: 6,
  foodNodeCount: 10,
  foodNodeMaxStock: 200,
  foodNodeRegenPerTick: 12,
};

const TICKS = 300;

interface RunOutput {
  readonly trace: string;
  readonly decisions: readonly RationalizerDecision[];
}

function run(rationalizer?: Rationalizer, ticks = TICKS): RunOutput {
  const sim = bootstrapHollowSim(rationalizer ? { ...PROFILE, rationalizer } : { ...PROFILE });
  const frames: string[] = [];
  const decisions: RationalizerDecision[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    if (sim.rationalizer) decisions.push(...sim.rationalizer.drainDecisions());
    if (i % 10 === 0) frames.push(JSON.stringify(sim.getSnapshot()));
  }
  return { trace: frames.join("\n"), decisions };
}

/** Same "always pick the last candidate" trick seam.test.ts uses to get a mix
 *  of adopted/kept-default/rejected outcomes rather than an all-agreeing run
 *  — duplicated on purpose (see file header). */
function contrarianStub(): Rationalizer {
  return createStubRationalizer({
    respond: (req) => ({ choiceIndex: req.candidates.length - 1, rationale: "I prefer the other one" }),
  });
}

/** Wraps a rationalizer with a `submit` counter, so a test can prove
 *  replay NEVER reaches back into whatever was recorded from — a plain
 *  reference count is not observable through `createReplayingRationalizer`
 *  (it holds no wrapped provider at all), so the guard has to sit on the
 *  provider that was recorded FROM, checked again after replay finishes. */
function countingRationalizer(inner: Rationalizer): Rationalizer & { readonly submitCount: number } {
  let count = 0;
  return {
    name: inner.name,
    submit(request) {
      count++;
      inner.submit(request);
    },
    poll() {
      return inner.poll();
    },
    get submitCount() {
      return count;
    },
  };
}

describe("createRecordingRationalizer is a transparent pass-through", () => {
  it("produces the same trace as talking to the wrapped provider directly", () => {
    const direct = run(createStubRationalizer());
    const recorder = createRecordingRationalizer(createStubRationalizer());
    const recorded = run(recorder);
    expect(recorded.trace).toBe(direct.trace);
  });
});

describe("record -> replay reproduces a run byte-identically", () => {
  it("replays every decision exactly and never calls the wrapped provider again", () => {
    const wrapped = countingRationalizer(contrarianStub());
    const recorder = createRecordingRationalizer(wrapped);

    const recorded = run(recorder);
    expect(recorded.decisions.length).toBeGreaterThan(0); // the seam actually fired
    expect(recorded.decisions.some((d) => d.outcome === "adopted")).toBe(true); // a real, non-trivial run
    const submitsAfterRecording = wrapped.submitCount;
    expect(submitsAfterRecording).toBeGreaterThan(0);

    // Serialize and deserialize — proves the snapshot really is plain JSON,
    // not e.g. a Map that happens to survive in-process.
    const roundTripped: RationalizerCacheData = JSON.parse(JSON.stringify(recorder.snapshot()));

    // Same provider name as the recording, so the replayed decision log
    // matches the recorded one field-for-field (a real CLI replay would do
    // the same, to keep chronicle attribution consistent across a
    // record/replay pair of runs).
    const replay = createReplayingRationalizer(roundTripped, { name: wrapped.name });
    const replayed = run(replay);

    // The spy that would catch a replay secretly falling back to the network:
    // the SAME wrapped instance, still sitting at its post-recording count.
    expect(wrapped.submitCount).toBe(submitsAfterRecording);

    expect(replayed.trace).toBe(recorded.trace);
    expect(replayed.decisions).toEqual(recorded.decisions);
    expect(replay.missCount).toBe(0);
  });
});

describe("a cache miss in replay is explicit, safe, and falls back to the BDI default", () => {
  it("never throws, logs a provider-error rejection, and reproduces the seam-OFF trace", () => {
    const off = run();
    const emptyCache: RationalizerCacheData = { version: 1, entries: {} };
    const replay = createReplayingRationalizer(emptyCache);

    const result = run(replay);

    expect(result.decisions.length).toBeGreaterThan(0); // consultations were still attempted
    for (const d of result.decisions) {
      expect(d.outcome).toBe("rejected");
      expect(d.reason).toBe("provider-error");
    }
    // Every submitted request misses (the cache is empty), but not every miss
    // necessarily surfaces as a logged decision — an answer the seam parks
    // and the agent never lives to reconsult before `requestTimeoutTicks`
    // expires unclaimed with no decision recorded at all (seam.ts's
    // `expire`). So misses is an upper bound on decisions, not an equality.
    expect(replay.missCount).toBeGreaterThanOrEqual(result.decisions.length);
    expect(result.trace).toBe(off.trace); // falling back to BDI default == seam off
  });
});
