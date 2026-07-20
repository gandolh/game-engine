/**
 * Real-structure tests for `HollowFeudSystem` (chunk hollow-12b), driving
 * `HollowSocialActSystem` (to actually emit the harm/cooperation broadcasts)
 * and `HollowFeudSystem` together over a hand-built World + real
 * `MessageBus` — mirrors `witness-system.test.ts`'s multi-system harness
 * (same one-tick delivery-delay contract; see that file's `step()` doc).
 * Proves the escalation/reconciliation/decay MECHANISM in isolation; the
 * real-run emergence claim (feud arcs actually appearing from organic
 * deliberation, not injected intentions) is covered separately by
 * `sim-bootstrap.divergence.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, createRng, type SimContext, type Intention, type AgentMessage } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { HollowEntity, Genome } from "../components";
import { NEED_WEALTH, GOOD_FOOD } from "../economy";
import { CommunityRegistry } from "../community";
import { ResourceWorld } from "../world";
import { HollowSocialActSystem } from "./act-system";
import { HollowFeudSystem, type FeudSystemOptions } from "./feud-system";
import { ONT_FEUD } from "../protocols";
import { FEUD_START_THRESHOLD, FEUD_INCREMENT_ATTACK, FEUD_RECONCILE_THRESHOLD, FEUD_DECAY_PER_TICK } from "./feud-constants";

type Agent = HollowEntity & { id: number };

function flatGenome(): Genome {
  return {
    behavior: {},
    aptitude: { food: 0, material: 1 },
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" },
  };
}

function spawnAgent(world: World<HollowEntity>, gx: number, gy: number): Agent {
  return world.spawn({
    agent: { gx, gy, moveTarget: null },
    needs: { byKind: { [NEED_WEALTH]: makeNeed({ value: 0, decayPerTick: 0 }) } },
    inventory: { goods: {} },
    fsm: { current: "ACT", enteredTick: 0 },
    beliefs: { data: {}, revision: 0 },
    intentions: { queue: [] },
    relationships: { byId: new Map() },
    communityId: null,
    genome: flatGenome(),
    skills: { byKind: { food: 0, material: 0 } },
    feud: { byId: new Map() },
  } satisfies HollowEntity) as Agent;
}

function makeHarness(feudOpts: FeudSystemOptions = {}) {
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  const resources = new ResourceWorld(createRng(9), {
    foodNodeCount: 0,
    materialNodeCount: 0,
    foodNodeMaxStock: 0,
    foodNodeRegenPerTick: 0,
    materialNodeMaxStock: 0,
    materialNodeRegenPerTick: 0,
  });
  const communities = new CommunityRegistry();
  const rng = createRng(9);
  const act = new HollowSocialActSystem(
    world,
    resources,
    communities,
    bus,
    rng.fork("steal-detection"),
    rng.fork("attack"),
    rng.fork("sabotage-detection"),
    { stealDetectionProb: 1, sabotageDetectionProb: 1, attackLethalityProb: 0 },
  );
  const feud = new HollowFeudSystem(world, bus, feudOpts);
  const feudEvents: { ontology: string; body: Record<string, unknown> }[] = [];
  for (const ontology of Object.values(ONT_FEUD)) {
    bus.subscribeOntology(ontology, (msg: AgentMessage) => {
      feudEvents.push({ ontology, body: msg.body });
    });
  }
  return {
    world,
    feudEvents,
    spawn: (gx: number, gy: number) => spawnAgent(world, gx, gy),
    /** One full tick, same order as sim-bootstrap.ts's real scheduler +
     *  `tick()`: PERCEIVE (`feud.run()` — applies whatever the PRIOR tick's
     *  flush buffered, plus passive decay) then ACT (`act.run()` — may emit
     *  a new broadcast into `inflight`), THEN `bus.flush()`/
     *  `notifySubscribers()`. */
    step(tick: number): void {
      feud.run({ tick } as SimContext);
      act.run({ tick } as SimContext);
      bus.flush();
      bus.notifySubscribers();
    },
  };
}

describe("HollowFeudSystem", () => {
  it("a single attack alone crosses FEUD_START_THRESHOLD and emits STARTED; a second attack emits ESCALATED", () => {
    const h = makeHarness();
    const attacker = h.spawn(0, 0);
    const victim = h.spawn(0, 0);

    attacker.intentions!.queue = [{ kind: "attack", data: { targetId: victim.id }, priority: 1 } as Intention];
    h.step(0); // ACT emits ATTACK
    h.step(1); // feud.run() escalates (sub-pass a), THEN decays once (sub-pass c) -- same run() call

    // One escalation, one decay tick, in that fixed order (this file's header).
    expect(victim.feud!.byId.get(attacker.id)).toBeCloseTo(FEUD_INCREMENT_ATTACK - FEUD_DECAY_PER_TICK, 6);
    expect(victim.feud!.byId.get(attacker.id)!).toBeGreaterThanOrEqual(FEUD_START_THRESHOLD);
    expect(h.feudEvents).toHaveLength(1);
    expect(h.feudEvents[0]!.ontology).toBe(ONT_FEUD.STARTED);
    expect(h.feudEvents[0]!.body["holderId"]).toBe(victim.id);
    expect(h.feudEvents[0]!.body["towardId"]).toBe(attacker.id);

    attacker.intentions!.queue = [{ kind: "attack", data: { targetId: victim.id }, priority: 1 } as Intention];
    h.step(2); // no new harm buffered yet -- feud.run() only decays once more
    h.step(3); // feud.run() escalates the second (buffered) attack, THEN decays again -- the feud is ALREADY active

    expect(h.feudEvents).toHaveLength(2);
    expect(h.feudEvents[1]!.ontology).toBe(ONT_FEUD.ESCALATED);
    // Two escalations, three total decay ticks (steps 1, 2, 3).
    expect(victim.feud!.byId.get(attacker.id)!).toBeCloseTo(FEUD_INCREMENT_ATTACK * 2 - FEUD_DECAY_PER_TICK * 3, 6);
  });

  it("a single detected steal alone does NOT cross the start threshold (needs repetition); the direct victim never touches the actor's own grudge", () => {
    const h = makeHarness();
    const thief = h.spawn(0, 0);
    const victim = h.spawn(0, 0);
    victim.inventory!.goods[GOOD_FOOD] = 10;

    thief.intentions!.queue = [{ kind: "steal", data: { targetId: victim.id, good: GOOD_FOOD, amount: 5 }, priority: 1 } as Intention];
    h.step(0);
    h.step(1);

    expect(victim.feud!.byId.get(thief.id)).toBeGreaterThan(0);
    expect(victim.feud!.byId.get(thief.id)!).toBeLessThan(FEUD_START_THRESHOLD);
    expect(h.feudEvents).toHaveLength(0); // below threshold -- no STARTED yet
    expect(thief.feud!.byId.get(victim.id) ?? 0).toBe(0); // the thief holds no grudge from its OWN act
  });

  it("cooperative reconciliation: a GIFT from the resented peer sharply reduces an active grudge and can emit RECONCILED", () => {
    const h = makeHarness();
    const attacker = h.spawn(0, 0);
    const victim = h.spawn(0, 0);

    // One detected sabotage alone starts a feud (0.3 >= FEUD_START_THRESHOLD).
    attacker.intentions!.queue = [{ kind: "sabotage", data: { targetId: victim.id }, priority: 1 } as Intention];
    h.step(0); // ACT emits SABOTAGE (forced-detected)
    h.step(1); // feud.run() escalates + decays once
    const beforeGift = victim.feud!.byId.get(attacker.id)!;
    expect(beforeGift).toBeGreaterThanOrEqual(FEUD_START_THRESHOLD);
    h.feudEvents.length = 0;

    // The saboteur now GIFTs the victim a genuine peace gesture.
    attacker.inventory!.goods["material"] = 10;
    attacker.intentions!.queue = [{ kind: "gift", data: { targetId: victim.id, good: "material", amount: 10 }, priority: 1 } as Intention];
    h.step(2); // ACT emits GIFT
    h.step(3); // feud.run() applies the buffered gift as a reconciliation

    const afterGift = victim.feud!.byId.get(attacker.id)!;
    expect(afterGift).toBeLessThan(beforeGift);
    expect(afterGift).toBeLessThan(FEUD_RECONCILE_THRESHOLD);
    expect(h.feudEvents.some((e) => e.ontology === ONT_FEUD.RECONCILED)).toBe(true);
  });

  it("passive decay: with no further harm or cooperation, an active grudge decays every tick and eventually reconciles on its own", () => {
    const h = makeHarness({ feudDecayPerTick: 0.05, feudStartThreshold: 0.2, feudReconcileThreshold: 0.1 });
    const attacker = h.spawn(0, 0);
    const victim = h.spawn(0, 0);

    attacker.intentions!.queue = [{ kind: "attack", data: { targetId: victim.id }, priority: 1 } as Intention];
    h.step(0);
    h.step(1); // grudge = FEUD_INCREMENT_ATTACK (0.5), STARTED fires
    expect(h.feudEvents.some((e) => e.ontology === ONT_FEUD.STARTED)).toBe(true);

    let tick = 2;
    let reconciled = false;
    for (let i = 0; i < 30 && !reconciled; i++) {
      h.step(tick++);
      reconciled = h.feudEvents.some((e) => e.ontology === ONT_FEUD.RECONCILED);
    }
    expect(reconciled).toBe(true);
    expect(victim.feud!.byId.get(attacker.id)!).toBeLessThan(0.1);
  });

  it("options override every constant (feudMax clamps escalation)", () => {
    const h = makeHarness({ feudMax: 0.3 });
    const attacker = h.spawn(0, 0);
    const victim = h.spawn(0, 0);

    attacker.intentions!.queue = [{ kind: "attack", data: { targetId: victim.id }, priority: 1 } as Intention];
    h.step(0);
    h.step(1);
    attacker.intentions!.queue = [{ kind: "attack", data: { targetId: victim.id }, priority: 1 } as Intention];
    h.step(2);
    h.step(3);

    expect(victim.feud!.byId.get(attacker.id)!).toBeLessThanOrEqual(0.3);
  });
});
