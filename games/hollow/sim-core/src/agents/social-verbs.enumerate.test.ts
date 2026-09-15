/**
 * Chunk hollow-13's candidate-enumeration refactor (`social-verbs.ts`).
 *
 * The claim under test is BEHAVIOR PRESERVATION: re-expressing
 * `chooseSocialAction` as "enumerate every feasible verb, then take the max"
 * picks the identical verb the pre-hollow-13 single-pass running-max loop
 * picked, in every case INCLUDING exact ties. The whole-sim evidence for
 * that is the 3-seed byte-identical headless export diff recorded in the
 * chunk handoff; this file asserts the same thing structurally, where a
 * regression would actually be readable:
 *
 *  1. `bestCandidateIndex` reproduces the old loop's tie-break exactly —
 *     strict `>`, so a tie keeps the EARLIER entry. This is the only place
 *     the tie-break lives now, so an exact-tie fixture here is a complete
 *     test of it (constructing two social verbs that tie to the last bit
 *     through their real weighted-average scores would test the same branch
 *     far less legibly).
 *  2. Over a sweep of hand-built agents, the enumerate/choose pair upholds
 *     the three invariants that together ARE the old loop's contract:
 *     `VERB_ORDER` ordering, the `SOCIAL_ACTION_MIN_SCORE` gate, and
 *     "`chooseSocialAction` is the first maximum of the enumeration".
 */
import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { Genome } from "../components";
import { ResourceWorld } from "../world";
import { NEED_FOOD, NEED_WEALTH, GOOD_FOOD, GOOD_MATERIALS } from "../economy";
import { SOCIAL_ACTION_MIN_SCORE } from "../social/deliberation-constants";
import { CommunityRegistry } from "../community";
import {
  chooseSocialAction,
  enumerateSocialActions,
  bestCandidateIndex,
  type ScoredChoice,
  type SocialAgent,
} from "./social-verbs";
import type { NeighborView, HollowDeliberationContext } from "./registry";

/** The fixed evaluation order from `social-verbs.ts`'s `VERB_ORDER` — the
 *  order `enumerateSocialActions` must return candidates in, and therefore
 *  also the tie-break order. Duplicated here on purpose: if someone reorders
 *  `VERB_ORDER`, this test is supposed to notice. */
const VERB_ORDER_KINDS = [
  "steal",
  "sabotage",
  "attack",
  "rumor",
  "gift",
  "share",
  "help_labor",
  "teach",
  "trade",
] as const;

function genome(overrides: Partial<Genome["behavior"]> = {}): Genome {
  return {
    behavior: {
      greed: 0.5,
      aggression: 0.5,
      risk: 0.5,
      loyalty: 0.5,
      sociability: 0.5,
      curiosity: 0.5,
      industriousness: 0.5,
      ...overrides,
    },
    aptitude: { food: 1, material: 1 },
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" },
  };
}

interface ActorSpec {
  readonly label: string;
  readonly behavior?: Partial<Genome["behavior"]>;
  readonly goods?: Record<string, number>;
  readonly foodNeed?: number;
  readonly wealthNeed?: number;
  readonly trust?: number;
  readonly materialSkill?: number;
  readonly communityId?: number | null;
}

function makeActor(spec: ActorSpec): SocialAgent {
  return {
    id: 1,
    agent: { gx: 0, gy: 0, moveTarget: null },
    needs: {
      byKind: {
        [NEED_FOOD]: makeNeed({ value: spec.foodNeed ?? 50, decayPerTick: 0 }),
        [NEED_WEALTH]: makeNeed({ value: spec.wealthNeed ?? 50, decayPerTick: 0 }),
      },
    },
    inventory: { goods: { ...(spec.goods ?? {}) } },
    genome: genome(spec.behavior),
    relationships: { byId: new Map<number, number>() },
    skills: { byKind: { food: 0, material: spec.materialSkill ?? 0 } },
    communityId: spec.communityId ?? null,
    householdId: null,
  } as unknown as SocialAgent;
}

function neighbor(id: number, materials: number, food: number, materialSkill = 0): NeighborView {
  return { id, gx: 1, gy: 0, communityId: null, householdId: null, materials, food, materialSkill };
}

function makeContext(neighbors: readonly NeighborView[]): HollowDeliberationContext {
  const resources = new ResourceWorld(createRng(1), {
    foodNodeCount: 0,
    materialNodeCount: 0,
    foodNodeMaxStock: 0,
    foodNodeRegenPerTick: 0,
    materialNodeMaxStock: 0,
    materialNodeRegenPerTick: 0,
  });
  return {
    tick: 0,
    resources,
    neighbors,
    ticksPerDay: 20,
    communities: new CommunityRegistry(),
    corpses: [],
    sick: [],
    medicMaxTreatmentsPerDay: 3,
  };
}

function scored(kind: string, score: number): ScoredChoice {
  return { kind, score, data: {} };
}

describe("bestCandidateIndex — the tie-break the old running-max loop had", () => {
  it("returns -1 for an empty candidate set (the 'nothing clears the gate' case)", () => {
    expect(bestCandidateIndex([])).toBe(-1);
  });

  it("keeps the EARLIER entry on an exact tie (strict >, first wins)", () => {
    const candidates = [scored("steal", 0.42), scored("gift", 0.42), scored("trade", 0.42)];
    expect(bestCandidateIndex(candidates)).toBe(0);
  });

  it("still keeps the earlier entry when the tie is not at index 0", () => {
    const candidates = [scored("steal", 0.1), scored("gift", 0.9), scored("teach", 0.9)];
    expect(bestCandidateIndex(candidates)).toBe(1);
  });

  it("picks a strictly greater later entry", () => {
    const candidates = [scored("steal", 0.5), scored("gift", 0.5000001)];
    expect(bestCandidateIndex(candidates)).toBe(1);
  });

  it("handles a single candidate", () => {
    expect(bestCandidateIndex([scored("share", 0)])).toBe(0);
  });
});

describe("enumerateSocialActions / chooseSocialAction agree (behavior preservation)", () => {
  // A deliberately wide sweep: each row drives a different subset of the nine
  // helpers past their hard gates, so between them the cases cover an empty
  // enumeration, a single candidate, and several multi-verb sets.
  const specs: readonly ActorSpec[] = [
    { label: "inert (every gate closed, nothing on hand)", behavior: { greed: 0, aggression: 0, loyalty: 0, sociability: 0, curiosity: 0 } },
    { label: "starving thief", behavior: { greed: 1, aggression: 1, risk: 1 }, foodNeed: 0 },
    { label: "rich philanthropist", behavior: { loyalty: 1, sociability: 1 }, goods: { [GOOD_MATERIALS]: 40, [GOOD_FOOD]: 40 } },
    { label: "community sharer", behavior: { loyalty: 1 }, goods: { [GOOD_MATERIALS]: 40 }, communityId: 7 },
    { label: "skilled teacher", behavior: { curiosity: 1, sociability: 1 }, materialSkill: 9 },
    { label: "trader (materials surplus, food deficit)", goods: { [GOOD_MATERIALS]: 40 }, foodNeed: 10 },
    { label: "belligerent", behavior: { aggression: 1, greed: 1, risk: 1 }, trust: 0, foodNeed: 5 },
    { label: "belligerent, trusted peers", behavior: { aggression: 1 }, trust: 1 },
    { label: "everything at once", behavior: { greed: 1, aggression: 1, loyalty: 1, sociability: 1, curiosity: 1, risk: 1 }, goods: { [GOOD_MATERIALS]: 40, [GOOD_FOOD]: 40 }, materialSkill: 9, foodNeed: 5, communityId: 3, trust: 0 },
  ];

  for (const spec of specs) {
    it(`${spec.label}: choose() is the first maximum of enumerate(), gated and in VERB_ORDER`, () => {
      const actor = makeActor(spec);
      const neighbors = [neighbor(2, 40, 40, 0), neighbor(3, 5, 5, 0), neighbor(4, 40, 5, 3)];
      if (spec.trust !== undefined) {
        for (const n of neighbors) actor.relationships.byId.set(n.id, spec.trust);
      }
      const ctx = makeContext(neighbors);

      const candidates = enumerateSocialActions(actor, ctx);
      const chosen = chooseSocialAction(actor, ctx);

      // 1. every entry cleared the feasibility gate.
      for (const c of candidates) expect(c.score).toBeGreaterThanOrEqual(SOCIAL_ACTION_MIN_SCORE);

      // 2. entries appear in VERB_ORDER order (a subsequence of it).
      const positions = candidates.map((c) => VERB_ORDER_KINDS.indexOf(c.kind as (typeof VERB_ORDER_KINDS)[number]));
      expect(positions).not.toContain(-1);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
      }

      // 3. the chooser is exactly the first maximum — the old loop's result.
      if (candidates.length === 0) {
        expect(chosen).toBeNull();
      } else {
        expect(chosen).not.toBeNull();
        // `chooseSocialAction` re-runs the enumeration, so these are equal VALUES,
        // not the same object identity — hence toStrictEqual.
        expect(chosen).toStrictEqual(candidates[bestCandidateIndex(candidates)]);
        for (const c of candidates) expect(chosen!.score).toBeGreaterThanOrEqual(c.score);
      }
    });
  }

  it("the restrictToCloseTies filter is applied before enumeration, not after", () => {
    // A generous actor with no household and no trusted peers: unrestricted
    // it finds targets, restricted it finds none (the filter runs BEFORE any
    // deliberate* helper — social-verbs.ts's header).
    const actor = makeActor({ label: "x", behavior: { loyalty: 1, sociability: 1 }, goods: { [GOOD_MATERIALS]: 40 } });
    const ctx = makeContext([neighbor(2, 5, 5)]);
    expect(enumerateSocialActions(actor, ctx, { restrictToCloseTies: false }).length).toBeGreaterThan(0);
    const restricted = enumerateSocialActions(actor, ctx, { restrictToCloseTies: true });
    // `share` needs no target, so it can survive the filter; anything that
    // names a peer must not.
    for (const c of restricted) expect(c.data["targetId"]).toBeUndefined();
  });
});
