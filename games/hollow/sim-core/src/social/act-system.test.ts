/**
 * Real-structure tests for `HollowSocialActSystem`, exercising the actual
 * production class directly over a hand-built World (mirrors
 * family/pairbond-system.test.ts's / community/dynamics.test.ts's harness
 * pattern) — intentions are injected directly (dispatch 6b's deliberation,
 * which CHOOSES these verbs, is out of scope here; see the brief).
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, createRng, type SimContext, type Intention } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { HollowEntity, Genome } from "../components";
import { NEED_WEALTH, GOOD_FOOD, GOOD_MATERIALS, MATERIAL_HARVEST_PER_TICK, WEALTH_PER_MATERIAL_UNIT } from "../economy";
import { CommunityRegistry } from "../community";
import { ResourceWorld } from "../world";
import { ONT_SOCIAL, type GiftBody, type TradeBody } from "../protocols";
import { HollowSocialActSystem, type SocialActSystemOptions } from "./act-system";
import { SABOTAGE_DESTROY_FRACTION, SABOTAGE_SKILL_PENALTY, ATTACK_TRUST_DELTA } from "./constants";

type Agent = HollowEntity & { id: number };

function flatGenome(materialAptitude = 1): Genome {
  return {
    behavior: {},
    aptitude: { food: 0, material: materialAptitude },
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" },
  };
}

function spawnAgent(
  world: World<HollowEntity>,
  opts: {
    gx?: number;
    gy?: number;
    goods?: Record<string, number>;
    communityId?: number | null;
    skillMaterial?: number;
    intention?: Intention;
  } = {},
): Agent {
  return world.spawn({
    agent: { gx: opts.gx ?? 0, gy: opts.gy ?? 0, moveTarget: null },
    needs: { byKind: { [NEED_WEALTH]: makeNeed({ value: 0, decayPerTick: 0 }) } },
    inventory: { goods: { ...(opts.goods ?? {}) } },
    fsm: { current: "ACT", enteredTick: 0 },
    beliefs: { data: {}, revision: 0 },
    intentions: { queue: opts.intention ? [opts.intention] : [] },
    relationships: { byId: new Map() },
    communityId: opts.communityId ?? null,
    genome: flatGenome(),
    skills: { byKind: { food: 0, material: opts.skillMaterial ?? 0 } },
  } satisfies HollowEntity) as Agent;
}

/** A harness with no resource nodes and an empty community registry — the
 *  verbs that need those (`help_labor`, `share`) build their own harness
 *  with the real thing instead (see below). */
function makeHarness(opts?: {
  stealDetectionProb?: number;
  attackLethalityProb?: number;
  sabotageDetectionProb?: number;
  resources?: ResourceWorld;
  communities?: CommunityRegistry;
}) {
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  const resources =
    opts?.resources ??
    new ResourceWorld(createRng(1), {
      foodNodeCount: 0,
      materialNodeCount: 0,
      foodNodeMaxStock: 0,
      foodNodeRegenPerTick: 0,
      materialNodeMaxStock: 0,
      materialNodeRegenPerTick: 0,
    });
  const communities = opts?.communities ?? new CommunityRegistry();
  const rng = createRng(1);
  const systemOpts: SocialActSystemOptions = {};
  if (opts?.stealDetectionProb !== undefined) systemOpts.stealDetectionProb = opts.stealDetectionProb;
  if (opts?.attackLethalityProb !== undefined) systemOpts.attackLethalityProb = opts.attackLethalityProb;
  if (opts?.sabotageDetectionProb !== undefined) systemOpts.sabotageDetectionProb = opts.sabotageDetectionProb;
  const system = new HollowSocialActSystem(
    world,
    resources,
    communities,
    bus,
    rng.fork("steal-detection"),
    rng.fork("attack"),
    rng.fork("sabotage-detection"),
    systemOpts,
  );
  const events: { ontology: string; body: Record<string, unknown> }[] = [];
  for (const ontology of Object.values(ONT_SOCIAL)) {
    bus.subscribeOntology(ontology, (msg) => events.push({ ontology, body: msg.body }));
  }
  return {
    world,
    bus,
    resources,
    communities,
    events,
    spawn: (o?: Parameters<typeof spawnAgent>[1]) => spawnAgent(world, o),
    step(tick = 0): void {
      system.run({ tick } as SimContext);
      bus.flush();
      bus.notifySubscribers();
    },
  };
}

describe("HollowSocialActSystem", () => {
  it("gift: actor loses goods, target gains exactly them, target's trust-toward-actor increases", () => {
    const h = makeHarness();
    const actor = h.spawn({ goods: { [GOOD_FOOD]: 10 }, intention: { kind: "gift", data: { targetId: 0, good: GOOD_FOOD, amount: 4 }, priority: 1 } });
    const target = h.spawn({});
    actor.intentions!.queue[0]!.data.targetId = target.id;

    h.step();

    expect(actor.inventory!.goods[GOOD_FOOD]).toBe(6);
    expect(target.inventory!.goods[GOOD_FOOD]).toBe(4);
    expect(target.relationships!.byId.get(actor.id)).toBeGreaterThan(0.5);
    expect(actor.intentions!.queue).toHaveLength(0);
    const gift = h.events.find((e) => e.ontology === ONT_SOCIAL.GIFT);
    expect(gift).toBeDefined();
    expect((gift!.body as unknown as GiftBody).amount).toBe(4);
  });

  it("gift: clamps to what the actor actually has, and self-target is a silent no-op", () => {
    const h = makeHarness();
    const actor = h.spawn({ goods: { [GOOD_FOOD]: 3 }, intention: { kind: "gift", data: { targetId: -1, good: GOOD_FOOD, amount: 10 }, priority: 1 } });
    const target = h.spawn({});
    actor.intentions!.queue[0]!.data.targetId = target.id;
    h.step();
    expect(actor.inventory!.goods[GOOD_FOOD]).toBe(0);
    expect(target.inventory!.goods[GOOD_FOOD]).toBe(3);

    const selfActor = h.spawn({ goods: { [GOOD_FOOD]: 5 }, intention: { kind: "gift", data: { good: GOOD_FOOD, amount: 5 }, priority: 1 } });
    selfActor.intentions!.queue[0]!.data.targetId = selfActor.id;
    h.step();
    expect(selfActor.inventory!.goods[GOOD_FOOD]).toBe(5); // untouched
  });

  it("share: contributes to the actor's community stockpile and drops the actor's inventory; no-op when unaffiliated", () => {
    const communities = new CommunityRegistry();
    const community = communities.form([1], [], 0);
    const h = makeHarness({ communities });
    const actor = h.spawn({ goods: { [GOOD_MATERIALS]: 20 }, communityId: community.id, intention: { kind: "share", data: { good: GOOD_MATERIALS, amount: 8 }, priority: 1 } });

    h.step();

    expect(actor.inventory!.goods[GOOD_MATERIALS]).toBe(12);
    expect(communities.get(community.id)!.stockpile[GOOD_MATERIALS]).toBe(8);

    const unaffiliated = h.spawn({ goods: { [GOOD_MATERIALS]: 5 }, intention: { kind: "share", data: { good: GOOD_MATERIALS, amount: 5 }, priority: 1 } });
    h.step();
    expect(unaffiliated.inventory!.goods[GOOD_MATERIALS]).toBe(5); // untouched -- no community to share into
  });

  it("help_labor: target inventory and wealth increase; the actor's own inventory never gains the produced goods", () => {
    const resources = new ResourceWorld(createRng(5), {
      foodNodeCount: 0,
      materialNodeCount: 1,
      foodNodeMaxStock: 0,
      foodNodeRegenPerTick: 0,
      materialNodeMaxStock: 1_000_000,
      materialNodeRegenPerTick: 0,
    });
    const node = resources.nodes[0]!;
    const h = makeHarness({ resources });
    const target = h.spawn({});
    const actor = h.spawn({ gx: node.gx, gy: node.gy, intention: { kind: "help_labor", data: { targetId: 0 }, priority: 1 } });
    actor.intentions!.queue[0]!.data.targetId = target.id;

    h.step();

    expect(actor.inventory!.goods[GOOD_MATERIALS] ?? 0).toBe(0);
    expect(target.inventory!.goods[GOOD_MATERIALS]).toBe(MATERIAL_HARVEST_PER_TICK);
    expect(target.needs!.byKind[NEED_WEALTH]!.value).toBeCloseTo(MATERIAL_HARVEST_PER_TICK * WEALTH_PER_MATERIAL_UNIT, 6);
    expect(target.relationships!.byId.get(actor.id)).toBeGreaterThan(0.5);
  });

  it("teach: target skill rises toward the actor's but is capped at the target's own aptitude; a teacher below the learner is a no-op", () => {
    const h = makeHarness();
    const teacher = h.spawn({ skillMaterial: 0.9, intention: { kind: "teach", data: { targetId: 0, skill: "material" }, priority: 1 } });
    const learner = h.spawn({ skillMaterial: 0.1 });
    learner.genome = flatGenome(0.3); // low aptitude cap
    teacher.intentions!.queue[0]!.data.targetId = learner.id;

    h.step();
    const after1 = learner.skills!.byKind["material"]!;
    expect(after1).toBeGreaterThan(0.1);
    expect(after1).toBeLessThanOrEqual(0.3); // never exceeds the learner's own aptitude cap

    // Run it many more times -- it should converge at/under the cap, never past it.
    for (let i = 0; i < 50; i++) {
      teacher.intentions!.queue = [{ kind: "teach", data: { targetId: learner.id, skill: "material" }, priority: 1 }];
      h.step(i + 1);
    }
    expect(learner.skills!.byKind["material"]!).toBeLessThanOrEqual(0.3);

    // A teacher who is NOT better than the learner is a no-op.
    const equalSkillTeacher = h.spawn({ skillMaterial: 0.3, intention: { kind: "teach", data: { targetId: 0, skill: "material" }, priority: 1 } });
    const stableLearner = h.spawn({ skillMaterial: 0.3 });
    equalSkillTeacher.intentions!.queue[0]!.data.targetId = stableLearner.id;
    h.step(100);
    expect(stableLearner.skills!.byKind["material"]).toBe(0.3);
  });

  it("trade: a satisfiable offer swaps goods and resolves exactly once; an unsatisfiable offer is rejected with no swap", () => {
    const h = makeHarness();
    const actor = h.spawn({
      goods: { [GOOD_FOOD]: 10 },
      intention: { kind: "trade", data: { targetId: 0, offerGood: GOOD_FOOD, offerAmount: 5, wantGood: GOOD_MATERIALS, wantAmount: 3 }, priority: 1 },
    });
    const target = h.spawn({ goods: { [GOOD_MATERIALS]: 8 } });
    actor.intentions!.queue[0]!.data.targetId = target.id;

    h.step();
    expect(actor.inventory!.goods[GOOD_FOOD]).toBe(5);
    expect(actor.inventory!.goods[GOOD_MATERIALS]).toBe(3);
    expect(target.inventory!.goods[GOOD_MATERIALS]).toBe(5);
    expect(target.inventory!.goods[GOOD_FOOD]).toBe(5);
    expect(actor.relationships!.byId.get(target.id)).toBeGreaterThan(0.5);
    const accepted = h.events.filter((e) => e.ontology === ONT_SOCIAL.TRADE);
    expect(accepted).toHaveLength(1);
    expect((accepted[0]!.body as unknown as TradeBody).accepted).toBe(true);

    // Tick again with an empty queue -- no double-settle (nothing left to settle).
    h.step(1);
    expect(actor.inventory!.goods[GOOD_FOOD]).toBe(5);
    expect(actor.inventory!.goods[GOOD_MATERIALS]).toBe(3);

    // A target that lacks the wanted goods -- rejected, no swap.
    const actor2 = h.spawn({
      goods: { [GOOD_FOOD]: 10 },
      intention: { kind: "trade", data: { targetId: 0, offerGood: GOOD_FOOD, offerAmount: 5, wantGood: GOOD_MATERIALS, wantAmount: 3 }, priority: 1 },
    });
    const target2 = h.spawn({}); // no materials at all
    actor2.intentions!.queue[0]!.data.targetId = target2.id;
    h.step(2);
    expect(actor2.inventory!.goods[GOOD_FOOD]).toBe(10); // unchanged
    expect(target2.inventory!.goods[GOOD_MATERIALS] ?? 0).toBe(0);
    const rejections = h.events.filter((e) => e.ontology === ONT_SOCIAL.TRADE && (e.body as unknown as TradeBody).accepted === false);
    expect(rejections.length).toBeGreaterThan(0);
  });

  it("steal: forced-detected moves goods AND collapses the target's trust-toward-actor; forced-undetected moves goods with no trust change", () => {
    const detected = makeHarness({ stealDetectionProb: 1 });
    const thief = detected.spawn({ intention: { kind: "steal", data: { targetId: 0, good: GOOD_FOOD, amount: 6 }, priority: 1 } });
    const victim = detected.spawn({ goods: { [GOOD_FOOD]: 10 } });
    thief.intentions!.queue[0]!.data.targetId = victim.id;
    detected.step();
    expect(thief.inventory!.goods[GOOD_FOOD]).toBe(6);
    expect(victim.inventory!.goods[GOOD_FOOD]).toBe(4);
    expect(victim.relationships!.byId.get(thief.id)!).toBeLessThan(0.5);
    expect(detected.events.some((e) => e.ontology === ONT_SOCIAL.STEAL_DETECTED)).toBe(true);

    const undetected = makeHarness({ stealDetectionProb: 0 });
    const thief2 = undetected.spawn({ intention: { kind: "steal", data: { targetId: 0, good: GOOD_FOOD, amount: 6 }, priority: 1 } });
    const victim2 = undetected.spawn({ goods: { [GOOD_FOOD]: 10 } });
    thief2.intentions!.queue[0]!.data.targetId = victim2.id;
    undetected.step();
    expect(thief2.inventory!.goods[GOOD_FOOD]).toBe(6);
    expect(victim2.inventory!.goods[GOOD_FOOD]).toBe(4);
    expect(victim2.relationships!.byId.get(thief2.id) ?? 0.5).toBe(0.5); // untouched (still neutral)
    expect(undetected.events.some((e) => e.ontology === ONT_SOCIAL.STEAL_DETECTED)).toBe(false);
  });

  it("sabotage: destroys a fraction of the target's materials and dents its material skill", () => {
    const h = makeHarness({ sabotageDetectionProb: 1 });
    const saboteur = h.spawn({ intention: { kind: "sabotage", data: { targetId: 0 }, priority: 1 } });
    const target = h.spawn({ goods: { [GOOD_MATERIALS]: 40 }, skillMaterial: 0.5 });
    saboteur.intentions!.queue[0]!.data.targetId = target.id;

    h.step();

    expect(target.inventory!.goods[GOOD_MATERIALS]).toBeCloseTo(40 * (1 - SABOTAGE_DESTROY_FRACTION), 6);
    expect(target.skills!.byKind["material"]!).toBeCloseTo(0.5 - SABOTAGE_SKILL_PENALTY, 6);
    expect(target.relationships!.byId.get(saboteur.id)!).toBeLessThan(0.5); // detected (prob forced to 1)
  });

  it("rumor: no direct effect on the actor or target themselves (third-party fan-out is social/witness-system.ts's job)", () => {
    const h = makeHarness();
    const actor = h.spawn({ intention: { kind: "rumor", data: { targetId: 0 }, priority: 1 } });
    const target = h.spawn({});
    actor.intentions!.queue[0]!.data.targetId = target.id;

    h.step();

    expect(target.relationships!.byId.get(actor.id) ?? 0.5).toBe(0.5);
    expect(actor.relationships!.byId.get(target.id) ?? 0.5).toBe(0.5);
    expect(h.events.some((e) => e.ontology === ONT_SOCIAL.RUMOR)).toBe(true);
  });

  it("attack: forced-lethal sets the violentDeath lifecycle seam; forced-non-lethal only drops trust", () => {
    const lethalHarness = makeHarness({ attackLethalityProb: 1 });
    const attacker = lethalHarness.spawn({ intention: { kind: "attack", data: { targetId: 0 }, priority: 1 } });
    const victim = lethalHarness.spawn({});
    attacker.intentions!.queue[0]!.data.targetId = victim.id;
    lethalHarness.step();
    expect(victim.beliefs!.data.violentDeath).toBe(true);

    const nonLethalHarness = makeHarness({ attackLethalityProb: 0 });
    const attacker2 = nonLethalHarness.spawn({ intention: { kind: "attack", data: { targetId: 0 }, priority: 1 } });
    const victim2 = nonLethalHarness.spawn({});
    attacker2.intentions!.queue[0]!.data.targetId = victim2.id;
    nonLethalHarness.step();
    expect(victim2.beliefs!.data.violentDeath).toBeUndefined();
    expect(victim2.relationships!.byId.get(attacker2.id)!).toBeCloseTo(0.5 - ATTACK_TRUST_DELTA, 6);
  });
});
