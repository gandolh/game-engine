/**
 * Unit-level coverage for the villager deliberator's survival ladder vs.
 * hollow-06b's social-verb layer — specifically the brief's "survival still
 * wins" gate: even an agent whose genome is maximally antagonistic
 * (aggression/greed at GENE_MAX) and who has an attractive, low-trust,
 * surplus-holding social target right next to it must STILL choose
 * `seek_food` while its food need is at/below `SEEK_THRESHOLD_FRACTION` —
 * the social layer (agents/social-verbs.ts) is only ever consulted AFTER
 * the unchanged hollow-03/05 ladder finds nothing urgent (see
 * villager.ts's header).
 */
import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import { personalityRegistry } from "./registry";
import { VILLAGER_KIND } from "./villager";
import type { HollowDeliberationContext, NeighborView } from "./registry";
import type { HollowEntity } from "../components";
import { makeSkills, GENE_MAX, GENE_MIN } from "../components";
import { NEED_FOOD, NEED_REST, NEED_WEALTH, SEEK_THRESHOLD_FRACTION } from "../economy";
import { ResourceWorld } from "../world";
import { CommunityRegistry } from "../community";

// Side-effecting import (mirrors agents/index.ts) so "villager" is
// registered even though this test imports registry.ts/villager.ts directly
// rather than through agents/index.ts.
import "./villager";

function makeCtx(): HollowDeliberationContext {
  const resources = new ResourceWorld(createRng(1), {
    foodNodeCount: 2,
    materialNodeCount: 2,
    foodNodeMaxStock: 200,
    foodNodeRegenPerTick: 5,
    materialNodeMaxStock: 200,
    materialNodeRegenPerTick: 5,
  });
  // A single nearby peer holding a hefty surplus of materials, at very low
  // trust toward the actor's beliefs about it — exactly the profile that
  // (absent a food crisis) would make `steal`/`sabotage` score highly.
  const neighbors: readonly NeighborView[] = [
    { id: 2, gx: 5, gy: 5, communityId: null, materials: 80, food: 80, materialSkill: 0.9 },
  ];
  // tick 0 is always the day-cycle's "commute" phase regardless of
  // `ticksPerDay` (fraction-of-day 0 falls in `DAY_PHASE_BOUNDARIES`'s
  // `[0, 0.15)` "commute" span) — chunk hollow-14c's routine gate
  // (agents/villager.ts's `applyRoutine`) falls through unchanged for
  // "commute", so this fixture stays a pure test of the survival-vs-social
  // ladder, untouched by the routine.
  return { tick: 0, resources, neighbors, ticksPerDay: 20, communities: new CommunityRegistry() };
}

function makeAgent(): HollowEntity & { id: number } {
  return {
    id: 1,
    agent: { gx: 5, gy: 5, moveTarget: null },
    needs: {
      byKind: {
        [NEED_FOOD]: makeNeed({ value: 5, max: 100, decayPerTick: 0.5 }), // 5% -- well below SEEK_THRESHOLD_FRACTION
        [NEED_REST]: makeNeed({ value: 100, max: 100, decayPerTick: 0.25 }),
        [NEED_WEALTH]: makeNeed({ value: 0, max: 100, decayPerTick: 0.2 }), // also starving for wealth
      },
    },
    inventory: { goods: {} },
    intentions: { queue: [] },
    // Maximally antagonistic genome -- if the social layer were consulted at
    // all this tick, `steal`/`sabotage` would trivially win.
    genome: {
      behavior: {
        sociability: GENE_MIN,
        risk: GENE_MAX,
        aggression: GENE_MAX,
        loyalty: GENE_MIN,
        greed: GENE_MAX,
        industriousness: 0.5,
        curiosity: GENE_MIN,
      },
      aptitude: { food: GENE_MAX, material: GENE_MAX },
      appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBrown" },
    },
    relationships: { byId: new Map([[2, 0.05]]) }, // very low trust toward the neighbor
    skills: makeSkills(),
    communityId: null,
  };
}

describe("villagerDeliberate: survival still wins over social choice (hollow-06b)", () => {
  it("an agent in a food crisis chooses seek_food, not a social verb, despite an antagonistic genome + an attractive target", () => {
    const agent = makeAgent();
    const ctx = makeCtx();

    const food = agent.needs!.byKind[NEED_FOOD]!;
    expect(food.value / food.max).toBeLessThanOrEqual(SEEK_THRESHOLD_FRACTION);

    const deliberate = personalityRegistry.get(VILLAGER_KIND);
    expect(deliberate).toBeDefined();
    deliberate!(agent, ctx);

    expect(agent.intentions!.queue).toHaveLength(1);
    expect(agent.intentions!.queue[0]!.kind).toBe("seek_food");
  });

  it("the same setup WITHOUT the food crisis lets the (now-attractive) social layer fire instead", () => {
    const agent = makeAgent();
    agent.needs!.byKind[NEED_FOOD]!.value = 100; // fully fed -- survival ladder clears
    agent.needs!.byKind[NEED_REST]!.value = 100;
    const ctx = makeCtx();

    const deliberate = personalityRegistry.get(VILLAGER_KIND);
    deliberate!(agent, ctx);

    expect(agent.intentions!.queue).toHaveLength(1);
    // A maximally greedy/aggressive/distrustful agent with a nearby
    // surplus-holding low-trust peer should pick an antagonistic verb here
    // (steal, given the wealth crisis + surplus materials neighbor) rather
    // than plain `work` -- confirms the social layer is genuinely reachable
    // once survival stops gating it (the control case for the test above).
    expect(agent.intentions!.queue[0]!.kind).not.toBe("work");
    expect(agent.intentions!.queue[0]!.data).toHaveProperty("targetId", 2);
  });
});
