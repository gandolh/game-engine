/**
 * Regression coverage for the promoted metric aggregates (chunk hollow-10a)
 * — adapted from `tools/hollow-sim/src/metrics.test.ts` (chunk hollow-07),
 * which still runs unchanged against these same functions via a re-export
 * shim. Kept here too so `@hollow/sim-core`'s own test run exercises the
 * code it now owns directly, not only transitively through the tool.
 */
import { describe, it, expect } from "vitest";
import {
  gini,
  mean,
  meanPairwiseTrust,
  wealthGini,
  meanGenes,
  communityStats,
  sumSocialCounts,
  COOP_VERBS,
  ANTAG_VERBS,
  type LivingAgentRead,
} from "./metrics";
import { BEHAVIOR_GENES } from "../components";
import type { HollowSnapshot } from "../sim-bootstrap";

function agent(overrides: Partial<LivingAgentRead> & { id: number }): LivingAgentRead {
  return {
    wealth: 0,
    behavior: {},
    relationshipScores: [],
    ...overrides,
  };
}

describe("gini", () => {
  it("is 0 for fewer than 2 values", () => {
    expect(gini([])).toBe(0);
    expect(gini([42])).toBe(0);
  });

  it("is 0 when every value is equal", () => {
    expect(gini([10, 10, 10, 10])).toBe(0);
  });

  it("approaches 1 as n grows for a single holder of all the wealth", () => {
    const n = 100;
    const values = new Array(n - 1).fill(0);
    values.push(100);
    expect(gini(values)).toBeCloseTo((n - 1) / n, 6);
    expect(gini(values)).toBeGreaterThan(0.9);
  });

  it("matches the known two-agent case (100/0 split -> 0.5)", () => {
    expect(gini([0, 100])).toBeCloseTo(0.5, 6);
  });

  it("is order-independent", () => {
    const a = gini([5, 1, 9, 3]);
    const b = gini([9, 3, 1, 5]);
    expect(a).toBe(b);
  });
});

describe("mean", () => {
  it("is 0 for an empty array", () => {
    expect(mean([])).toBe(0);
  });
  it("averages plain numbers", () => {
    expect(mean([1, 2, 3])).toBeCloseTo(2, 10);
  });
});

describe("meanPairwiseTrust", () => {
  it("is 0 when no agent has any relationship entries", () => {
    const agents = [agent({ id: 1 }), agent({ id: 2 })];
    expect(meanPairwiseTrust(agents)).toBe(0);
  });

  it("skips agents with no entries and flattens the rest", () => {
    const agents = [
      agent({ id: 1, relationshipScores: [0.8, 0.2] }),
      agent({ id: 2, relationshipScores: [] }),
      agent({ id: 3, relationshipScores: [0.5] }),
    ];
    expect(meanPairwiseTrust(agents)).toBeCloseTo(1.5 / 3, 10);
  });
});

describe("wealthGini", () => {
  it("delegates to gini() over the wealth field", () => {
    const agents = [agent({ id: 1, wealth: 10 }), agent({ id: 2, wealth: 10 })];
    expect(wealthGini(agents)).toBe(0);
  });
});

describe("meanGenes", () => {
  it("computes one mean per BEHAVIOR_GENES entry, in order", () => {
    const agents = [
      agent({ id: 1, behavior: { sociability: 1, risk: 0 } }),
      agent({ id: 2, behavior: { sociability: 0, risk: 1 } }),
    ];
    const genes = meanGenes(agents);
    expect(Object.keys(genes)).toEqual([...BEHAVIOR_GENES]);
    expect(genes["sociability"]).toBeCloseTo(0.5, 10);
    expect(genes["risk"]).toBeCloseTo(0.5, 10);
    expect(genes["curiosity"]).toBe(0);
  });
});

describe("communityStats", () => {
  function snap(communities: HollowSnapshot["communities"]): HollowSnapshot {
    return {
      tick: 0,
      aliveCount: 0,
      agents: [],
      resourceNodes: [],
      communities,
      bornCount: 0,
      diedCount: 0,
      householdCount: 0,
      socialCounts: {},
    };
  }

  it("is count 0 / meanSize 0 with no communities", () => {
    const stats = communityStats(snap([]));
    expect(stats.count).toBe(0);
    expect(stats.meanSize).toBe(0);
  });

  it("averages member counts across communities", () => {
    const communities: HollowSnapshot["communities"] = [
      { id: 1, members: [1, 2, 3], territory: [], stockpile: {}, norms: { shareRate: 0, cooperationExpectation: 0 } },
      { id: 2, members: [4, 5], territory: [], stockpile: {}, norms: { shareRate: 0, cooperationExpectation: 0 } },
    ];
    const stats = communityStats(snap(communities));
    expect(stats.count).toBe(2);
    expect(stats.meanSize).toBeCloseTo(2.5, 10);
  });
});

describe("sumSocialCounts", () => {
  it("sums the given verb keys and defaults missing ones to 0", () => {
    const counts = { gift: 3, share: 2, help: 0 };
    expect(sumSocialCounts(counts, COOP_VERBS)).toBe(5);
    expect(sumSocialCounts(counts, ANTAG_VERBS)).toBe(0);
  });
});
