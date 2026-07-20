/**
 * Unit coverage for chunk hollow-12b's grudge-amplification term in the
 * antagonistic `deliberate*` helpers (social-verbs.ts) — proves the
 * MECHANISM in isolation via hand-built genome/relationships/feud state and
 * a direct `chooseSocialAction` call (no full `bootstrapHollowSim` needed
 * here; the real-run emergence claim is covered separately by
 * `sim-bootstrap.divergence.test.ts`).
 */
import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { Genome } from "../components";
import { ResourceWorld } from "../world";
import { NEED_FOOD, NEED_WEALTH } from "../economy";
import { STEAL_GREED_GATE } from "../social/deliberation-constants";
import { FEUD_DELIBERATION_WEIGHT } from "../social/feud-constants";
import { chooseSocialAction, type SocialAgent } from "./social-verbs";
import type { NeighborView, HollowDeliberationContext } from "./registry";
import { CommunityRegistry } from "../community";

function flatGenome(overrides: Partial<Genome["behavior"]> = {}): Genome {
  return {
    behavior: { greed: 1, aggression: 0, risk: 0.5, loyalty: 0, sociability: 0, curiosity: 0, ...overrides },
    aptitude: { food: 1, material: 1 },
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" },
  };
}

function makeActor(): SocialAgent {
  return {
    id: 1,
    agent: { gx: 0, gy: 0, moveTarget: null },
    needs: {
      byKind: {
        [NEED_FOOD]: makeNeed({ value: 0, decayPerTick: 0 }),
        [NEED_WEALTH]: makeNeed({ value: 100, decayPerTick: 0 }),
      },
    },
    inventory: { goods: {} },
    genome: flatGenome({ greed: STEAL_GREED_GATE + 0.1 }), // clears steal's hard gate
    relationships: { byId: new Map() },
    skills: { byKind: { food: 0, material: 0 } },
  } as unknown as SocialAgent;
}

function candidate(id: number, gx: number, gy: number, materials: number): NeighborView {
  return { id, gx, gy, communityId: null, materials, food: 20, materialSkill: 0 };
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
  // `ticksPerDay`/`communities` (chunk hollow-14c) are unused by
  // `chooseSocialAction` itself (only `agents/villager.ts`'s
  // `applyRoutine` reads them) — present only so this fixture satisfies
  // `HollowDeliberationContext`'s shape.
  return { tick: 0, resources, neighbors, ticksPerDay: 20, communities: new CommunityRegistry() };
}

describe("grudge amplification (chunk hollow-12b)", () => {
  it("a held grudge tips target SELECTION toward the resented peer over an equally-trusted, lower-id rival", () => {
    const actor = makeActor();
    // Both candidates hold identical (neutral) trust and identical food/
    // materials -- a genuine tie on every existing factor. Candidate 2 (the
    // LOWER id) would normally win the tie-break (strict `<` keeps the
    // first-seen candidate -- see social-verbs.ts's header).
    const candidates = [candidate(2, 1, 0, 20), candidate(3, 2, 0, 20)];
    actor.relationships.byId.set(2, 0.5);
    actor.relationships.byId.set(3, 0.5);

    const withoutGrudge = chooseSocialAction(actor, makeContext(candidates));
    expect(withoutGrudge).not.toBeNull();
    expect(withoutGrudge!.kind).toBe("steal");
    expect(withoutGrudge!.data.targetId).toBe(2); // lowest-id tie-break, no grudge in play

    // Now the actor holds a grudge against candidate 3 -- selection should
    // flip toward it despite candidate 2's tie-break priority.
    actor.feud = { byId: new Map([[3, 1]]) }; // FEUD_MAX
    const withGrudge = chooseSocialAction(actor, makeContext(candidates));
    expect(withGrudge).not.toBeNull();
    expect(withGrudge!.kind).toBe("steal");
    expect(withGrudge!.data.targetId).toBe(3);
  });

  it("a held grudge adds a bounded, positive bonus to the final score without a grudge alone forcing a pass", () => {
    const actor = makeActor();
    const candidates = [candidate(2, 1, 0, 20)];
    actor.relationships.byId.set(2, 0.5);

    const withoutGrudge = chooseSocialAction(actor, makeContext(candidates));
    expect(withoutGrudge).not.toBeNull();

    actor.feud = { byId: new Map([[2, 1]]) }; // FEUD_MAX
    const withGrudge = chooseSocialAction(actor, makeContext(candidates));
    expect(withGrudge).not.toBeNull();

    // Same target either way here (only one candidate); the grudge only
    // moves the SCORE, by at most FEUD_DELIBERATION_WEIGHT.
    expect(withGrudge!.data.targetId).toBe(withoutGrudge!.data.targetId);
    expect(withGrudge!.score - withoutGrudge!.score).toBeCloseTo(FEUD_DELIBERATION_WEIGHT, 6);
  });

  it("missing `feud` component reads as no grudge (defensive default), same result as an explicit empty ledger", () => {
    const actor = makeActor();
    delete (actor as { feud?: unknown }).feud;
    const candidates = [candidate(2, 1, 0, 20)];
    actor.relationships.byId.set(2, 0.5);

    const noFeudComponent = chooseSocialAction(actor, makeContext(candidates));
    actor.feud = { byId: new Map() };
    const emptyFeudLedger = chooseSocialAction(actor, makeContext(candidates));

    expect(noFeudComponent!.score).toBeCloseTo(emptyFeudLedger!.score, 10);
  });
});
