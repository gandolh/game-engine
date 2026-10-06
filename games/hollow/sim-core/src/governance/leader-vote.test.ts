/**
 * hollow-17: the rationalizer's second site, the leader's `shareRate` vote.
 *
 * Exercised over the real `HollowGovernanceSystem` and a real
 * `RationalizerSeam`, on a hand-built world (the same harness shape as
 * `governance-system.test.ts`), with the governance interval at 1 so every
 * step is a pass. Each step drains the seam first, as `HollowDeliberateSystem`
 * does once per tick before the GOVERNANCE stage runs.
 *
 * The decision being tested is in corpus/wiki/decisions.md → Hollow — the
 * LLM-rationalizer seam (hollow-17).
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, type SimContext } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { HollowEntity, Genome } from "../components";
import { NEED_BELONGING } from "../economy";
import { CommunityRegistry } from "../community";
import type { HollowDeliberationContext } from "../agents/registry";
import type { SocialAgent } from "../agents/social-verbs";
import { createStubRationalizer, RationalizerSeam, type Rationalizer, type RationalizerDecision, type RationalizerRequest } from "../rationalize";
import { HollowGovernanceSystem, SHARE_RATE_VOTE_KIND, SHARE_RATE_VOTE_STANCES } from "./governance-system";

type Agent = HollowEntity & { id: number };

function genome(loyalty: number, greed: number): Genome {
  return {
    behavior: { sociability: 0.5, risk: 0.5, aggression: 0.5, loyalty, greed, industriousness: 0.5, curiosity: 0.5 },
    aptitude: { food: 0.5, material: 0.5 },
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" },
  };
}

function spawn(world: World<HollowEntity>, g: Genome): Agent {
  return world.spawn({
    agent: { gx: 0, gy: 0, moveTarget: null },
    needs: { byKind: { [NEED_BELONGING]: makeNeed({ value: 50, decayPerTick: 0 }) } },
    inventory: { goods: {} },
    intentions: { queue: [] },
    relationships: { byId: new Map() },
    communityId: null,
    genome: g,
  } satisfies HollowEntity) as Agent;
}

/** Always answers with the stance at `index` (0 low, 1 own, 2 high). */
function always(index: number): Rationalizer {
  return createStubRationalizer({
    name: `always-${String(index)}`,
    respond: (req) => ({ choiceIndex: index, rationale: `stance ${String(index)}` }),
  });
}

/** Records every request it is handed, and never answers. */
function recorder(): Rationalizer & { requests: RationalizerRequest[] } {
  const requests: RationalizerRequest[] = [];
  return { name: "recorder", requests, submit: (r) => void requests.push(r), poll: () => [] };
}

/**
 * A three-member community led by A. A is loyal and unselfish (prefers a high
 * share rate); B and C are greedy (prefer a low one), so the vote is live from
 * the first pass. B and C trust A, which makes A the leader.
 */
function harness(provider: Rationalizer | null) {
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  const registry = new CommunityRegistry();
  const seam = provider ? new RationalizerSeam(provider) : null;
  const governance = new HollowGovernanceSystem(world, registry, bus, { intervalTicks: 1, rationalizer: seam });
  const a = spawn(world, genome(0.9, 0.1));
  const b = spawn(world, genome(0.1, 0.9));
  const c = spawn(world, genome(0.1, 0.9));
  b.relationships!.byId.set(a.id, 0.9);
  c.relationships!.byId.set(a.id, 0.9);
  const community = registry.form([a.id, b.id, c.id], [], 0);
  for (const e of [a, b, c]) e.communityId = community.id;
  const decisions: RationalizerDecision[] = [];
  let tick = 0;
  return {
    world,
    registry,
    seam,
    a,
    b,
    c,
    community,
    decisions,
    step(): void {
      seam?.drain(tick);
      const ctx: SimContext = { tick };
      governance.run(ctx);
      bus.flush();
      bus.notifySubscribers();
      if (seam) decisions.push(...seam.drainDecisions());
      tick++;
    },
    /** The shareRate after each of `n` steps. */
    shareRates(n: number): number[] {
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        this.step();
        out.push(registry.get(community.id)!.norms.shareRate);
      }
      return out;
    },
  };
}

describe("hollow-17 — the leader's shareRate vote through the rationalizer", () => {
  it("a seam that keeps the default moves the norm exactly as no seam does", () => {
    const off = harness(null).shareRates(8);
    const agreeing = harness(createStubRationalizer());
    expect(agreeing.shareRates(8)).toEqual(off);
    expect(agreeing.decisions.length).toBeGreaterThan(0);
    expect(agreeing.decisions.every((d) => d.site === "governance-vote" && d.outcome === "kept-default")).toBe(true);
  });

  it("offers exactly the leader's three stances, as the leader, with the leader's own vote as the default", () => {
    const rec = recorder();
    const h = harness(rec);
    h.step();
    expect(rec.requests).toHaveLength(1);
    const req = rec.requests[0]!;
    expect(req.site).toBe("governance-vote");
    expect(req.agentId).toBe(h.a.id);
    expect(req.standing).toMatchObject({ communityId: h.community.id, isLeader: true, memberCount: 3 });
    expect(req.candidates.map((c) => c.kind)).toEqual([SHARE_RATE_VOTE_KIND, SHARE_RATE_VOTE_KIND, SHARE_RATE_VOTE_KIND]);
    expect(req.candidates.map((c) => c.data["stance"])).toEqual([...SHARE_RATE_VOTE_STANCES]);
    expect(req.candidates.every((c) => c.data["leaderId"] === h.a.id && c.data["communityId"] === h.community.id)).toBe(true);
    expect(req.candidates[req.bdiChoiceIndex]!.data["stance"]).toBe("own");
    expect(req.decision).toMatchObject({ norm: "shareRate", memberCount: 3 });
    // The voters A is weighed against are the community, not passers-by.
    expect(req.relationships.map((r) => r.peerId)).toEqual([h.b.id, h.c.id]);
  });

  it("an adopted stance moves only the leader's vote, in the direction chosen", () => {
    const off = harness(null).shareRates(8);
    const low = harness(always(0));
    const lowRates = low.shareRates(8);
    const high = harness(always(2));
    const highRates = high.shareRates(8);

    expect(low.decisions.some((d) => d.outcome === "adopted")).toBe(true);
    expect(high.decisions.some((d) => d.outcome === "adopted")).toBe(true);
    // Adopted from the second pass on (an answer is claimed a pass later).
    for (let i = 0; i < off.length; i++) {
      expect(lowRates[i]!).toBeLessThanOrEqual(off[i]! + 1e-12);
      expect(highRates[i]!).toBeGreaterThanOrEqual(off[i]! - 1e-12);
    }
    // The norm here climbs at the per-pass cap (`NORM_VOTE_STEP`) already, so
    // a leader voting `high` cannot move it faster: adopted, and no change.
    // Adoption means the vote was cast differently, not that the norm moved.
    // Voting against the drift does slow it.
    expect(lowRates).not.toEqual(off);
    expect(highRates).toEqual(off);
    // Every adopted choice is a vote, never anything else.
    for (const d of [...low.decisions, ...high.decisions]) expect(d.chosenKind).toBe(SHARE_RATE_VOTE_KIND);
  });

  it("an answer reasoned by one leader is never cast by the next", () => {
    const h = harness(always(2));
    h.step(); // A leads; a request goes out as A.
    // Leadership passes to B before A's answer can be claimed.
    h.a.relationships!.byId.set(h.b.id, 0.99);
    h.c.relationships!.byId.set(h.b.id, 0.99);
    h.c.relationships!.byId.set(h.a.id, 0.1);
    h.b.relationships!.byId.set(h.a.id, 0.1);
    h.step();
    expect(h.registry.get(h.community.id)!.leaderId).toBe(h.b.id);
    const claimed = h.decisions.find((d) => d.agentId === h.a.id);
    expect(claimed).toMatchObject({ site: "governance-vote", outcome: "rejected", reason: "stale-candidates" });
  });

  it("an answer whose community stops being consulted is recorded as expired, not dropped", () => {
    const h = harness(always(2));
    h.step(); // request issued at tick 0, answered on the next drain
    h.registry.removeMember(h.community.id, h.c.id);
    h.registry.removeMember(h.community.id, h.b.id); // one member left: no more votes to cast
    for (let i = 0; i < 4; i++) h.step(); // two intervals pass
    expect(h.decisions).toEqual([
      expect.objectContaining({ site: "governance-vote", outcome: "rejected", reason: "expired", agentId: h.a.id }),
    ]);
  });

  it("a leader with a social consultation in flight can still be asked about their vote", () => {
    const rec = recorder();
    const h = harness(rec);
    const ctx = { tick: 0, neighbors: [], communities: h.registry } as unknown as HollowDeliberationContext;
    h.seam!.consider({
      agent: { ...h.a, skills: { byKind: {} } } as unknown as SocialAgent,
      ctx,
      candidates: [
        { kind: "steal", data: { targetId: h.b.id, good: "food", amount: 1 }, score: 0.6 },
        { kind: "gift", data: { targetId: h.c.id, good: "food", amount: 1 }, score: 0.5 },
      ],
      bdiChoiceIndex: 1,
    });
    h.step();
    expect(rec.requests.map((r) => [r.site, r.agentId])).toEqual([
      ["social", h.a.id],
      ["governance-vote", h.a.id],
    ]);
  });
});
