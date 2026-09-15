/**
 * The offline stub provider (chunk hollow-13) and the request builder's
 * payload discipline. Both are small, but both are contracts other chunks
 * are written against: the stub is CI's default provider, and the request is
 * the exact shape chunk 4's real provider has to turn into a prompt.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import { ResourceWorld } from "../world";
import { CommunityRegistry } from "../community";
import { NEED_FOOD, NEED_WEALTH, GOOD_MATERIALS } from "../economy";
import type { SocialAgent, ScoredChoice } from "../agents/social-verbs";
import type { HollowDeliberationContext, NeighborView } from "../agents/registry";
import { createStubRationalizer, stubRationale } from "./stub";
import { buildRationalizerRequest, RELATIONSHIP_BUDGET } from "./request";
import type { RationalizerRequest } from "./types";

const CANDIDATES: readonly ScoredChoice[] = [
  { kind: "steal", score: 0.7, data: { targetId: 3, good: "food", amount: 5 } },
  { kind: "gift", score: 0.65, data: { targetId: 2, good: "materials", amount: 4 } },
];

function makeAgent(): SocialAgent {
  return {
    id: 1,
    agent: { gx: 0, gy: 0, moveTarget: null },
    beliefs: { data: { starving: true, foodDepletedTicks: 12, pendingDeathCause: "starvation" }, revision: 3 },
    needs: {
      byKind: {
        [NEED_WEALTH]: makeNeed({ value: 40, max: 100, decayPerTick: 0 }),
        [NEED_FOOD]: makeNeed({ value: 10, max: 100, decayPerTick: 0 }),
      },
    },
    inventory: { goods: { [GOOD_MATERIALS]: 12 } },
    genome: {
      behavior: { greed: 0.9, aggression: 0.2, risk: 0.5, loyalty: 0.3, sociability: 0.4, curiosity: 0.1, industriousness: 0.7 },
      aptitude: { food: 0.8, material: 0.3 },
      appearance: { height: 1.02, build: 0.97, skinTone: "skinDark", hairTone: "hairRed" },
    },
    relationships: { byId: new Map<number, number>() },
    skills: { byKind: { food: 2, material: 1 } },
    feud: { byId: new Map<number, number>() },
    communityId: null,
    householdId: null,
  } as unknown as SocialAgent;
}

function neighbor(id: number): NeighborView {
  return { id, gx: 1, gy: 0, communityId: null, householdId: null, materials: 10, food: 10, materialSkill: 0 };
}

function makeContext(neighbors: readonly NeighborView[], tick = 77): HollowDeliberationContext {
  return {
    tick,
    resources: new ResourceWorld(createRng(1), {
      foodNodeCount: 0,
      materialNodeCount: 0,
      foodNodeMaxStock: 0,
      foodNodeRegenPerTick: 0,
      materialNodeMaxStock: 0,
      materialNodeRegenPerTick: 0,
    }),
    neighbors,
    ticksPerDay: 20,
    communities: new CommunityRegistry(),
    corpses: [],
    sick: [],
    medicMaxTreatmentsPerDay: 3,
  };
}

function buildRequest(): RationalizerRequest {
  const agent = makeAgent();
  // A spread of trust readings so the "most extreme ties" ranking has
  // something to rank; ids 2 and 3 are candidate targets.
  const neighbors = Array.from({ length: 14 }, (_, i) => neighbor(i + 2));
  for (const n of neighbors) agent.relationships.byId.set(n.id, 0.5 + (n.id % 5) * 0.05);
  agent.relationships.byId.set(11, 0.02); // a deeply distrusted peer
  return buildRationalizerRequest(agent, makeContext(neighbors), CANDIDATES, 0);
}

describe("createStubRationalizer", () => {
  it("echoes the BDI default with a templated rationale", () => {
    const stub = createStubRationalizer();
    const request = buildRequest();
    stub.submit(request);
    const [result] = stub.poll();
    expect(result!.request).toBe(request); // echoed verbatim, not re-authored
    expect(result!.response).toEqual({ choiceIndex: request.bdiChoiceIndex, rationale: stubRationale(request) });
    expect(result!.error).toBeUndefined();
  });

  it("delivers each result exactly once", () => {
    const stub = createStubRationalizer();
    stub.submit(buildRequest());
    expect(stub.poll()).toHaveLength(1);
    expect(stub.poll()).toHaveLength(0);
  });

  it("returns nothing before anything is submitted (submit/poll, never blocking)", () => {
    expect(createStubRationalizer().poll()).toHaveLength(0);
  });

  it("is deterministic — same request, same answer, every time", () => {
    const request = buildRequest();
    const a = createStubRationalizer();
    const b = createStubRationalizer();
    a.submit(request);
    b.submit(request);
    expect(JSON.stringify(a.poll())).toBe(JSON.stringify(b.poll()));
  });

  it("reports a provider failure as an error result rather than throwing", () => {
    const stub = createStubRationalizer({ failWith: () => "timeout" });
    expect(() => stub.submit(buildRequest())).not.toThrow();
    const [result] = stub.poll();
    expect(result!.error).toBe("timeout");
  });

  it("lets a test inject an arbitrary (including illegal) raw answer", () => {
    const stub = createStubRationalizer({ respond: () => "not even JSON" });
    stub.submit(buildRequest());
    expect(stub.poll()[0]!.response).toBe("not even JSON");
  });
});

describe("buildRationalizerRequest — small, structured, plain data", () => {
  const request = buildRequest();

  it("carries the decision context the spec names, and the candidate set", () => {
    expect(request.agentId).toBe(1);
    expect(request.tick).toBe(77);
    expect(request.genome.behavior["greed"]).toBe(0.9);
    expect(request.genome.appearance.skinTone).toBe("skinDark");
    expect(request.needs[NEED_FOOD]).toBeCloseTo(0.1);
    expect(request.standing).toEqual({ communityId: null, memberCount: 0, standing: null, isLeader: false });
    expect(request.candidates.map((c) => c.kind)).toEqual(["steal", "gift"]);
    expect(request.candidates.map((c) => c.index)).toEqual([0, 1]);
    expect(request.bdiChoiceIndex).toBe(0);
    expect(request.candidateFingerprint.length).toBeGreaterThan(0);
  });

  it("projects only the declared belief keys — internal state never leaks by accident", () => {
    // `pendingDeathCause` is on the entity but not in BELIEF_KEYS, so it must
    // not travel. A future system adding a belief field should not silently
    // start shipping it to a model.
    expect(Object.keys(request.beliefs).sort()).toEqual(["foodDepletedTicks", "starving"]);
  });

  it("includes every candidate target, plus a bounded number of extreme ties, ascending by id", () => {
    const ids = request.relationships.map((r) => r.peerId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    // Both candidate targets present regardless of how ordinary their trust is…
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    // …and the most distrusted peer made the extreme-tie cut…
    expect(ids).toContain(11);
    // …but not all 14 neighbors: the budget holds.
    expect(ids.length).toBeLessThanOrEqual(RELATIONSHIP_BUDGET + 2);
    expect(request.relationships.filter((r) => r.isCandidateTarget).map((r) => r.peerId)).toEqual([2, 3]);
  });

  it("is plain serializable data — no live refs, no Maps", () => {
    const round = JSON.parse(JSON.stringify(request)) as RationalizerRequest;
    expect(round).toEqual(request);
  });

  it("is a pure function of state — building it twice gives the same request", () => {
    expect(JSON.stringify(buildRequest())).toBe(JSON.stringify(request));
  });
});
