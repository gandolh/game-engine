/**
 * Real-structure tests for `HollowSocialWitnessSystem`'s third-party trust
 * folding, driving `HollowSocialActSystem` (to actually emit the RUMOR/
 * STEAL_DETECTED broadcasts) and `HollowSocialWitnessSystem` together over
 * a hand-built World + real `MessageBus`, mirroring
 * community/dynamics.test.ts's multi-system harness.
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, createRng, type SimContext } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { HollowEntity, Genome } from "../components";
import { NEED_WEALTH, GOOD_FOOD } from "../economy";
import { CommunityRegistry } from "../community";
import { ResourceWorld } from "../world";
import { HollowSocialActSystem } from "./act-system";
import { HollowSocialWitnessSystem } from "./witness-system";
import { RUMOR_TRUST_DELTA, RUMOR_CONNECTED_FACTOR, STEAL_WITNESS_TRUST_DELTA } from "./constants";

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
  } satisfies HollowEntity) as Agent;
}

function makeHarness() {
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
    { stealDetectionProb: 1 }, // force every steal to be caught, for the witness test below
  );
  const witness = new HollowSocialWitnessSystem(world, bus);
  return {
    world,
    spawn: (gx: number, gy: number) => spawnAgent(world, gx, gy),
    /** One full tick, in the SAME order as sim-bootstrap.ts's real
     *  scheduler + `tick()`: PERCEIVE (`witness.run()` -- applies whatever
     *  the PRIOR tick's flush buffered) then ACT (`act.run()` -- may emit a
     *  new broadcast into `inflight`), THEN `bus.flush()`/
     *  `notifySubscribers()` (moves this tick's `inflight` to
     *  `deliverable` and dispatches it to the witness system's subscriber,
     *  buffering it for the FOLLOWING tick's `witness.run()`). This is what
     *  produces the genuine one-tick delivery delay documented in
     *  social/witness-system.ts's header — a rumor/steal-detected emitted
     *  during tick T's ACT is only folded during tick T+1's `run()`. */
    step(tick: number): void {
      witness.run({ tick } as SimContext);
      act.run({ tick } as SimContext);
      bus.flush();
      bus.notifySubscribers();
    },
  };
}

describe("HollowSocialWitnessSystem", () => {
  it("rumor: a nearby third party's trust-toward-target drops after the rumor propagates; a distant, unconnected agent is unaffected", () => {
    const h = makeHarness();
    const spreader = h.spawn(0, 0);
    const target = h.spawn(5, 5);
    const nearbyWitness = h.spawn(1, 1); // within WITNESS_PROXIMITY_TILES of the spreader
    const distantUnconnectedWitness = h.spawn(50, 50); // far away, no relationship to the spreader
    const distantConnectedWitness = h.spawn(50, 50); // far away, but already trusts/knows the spreader
    distantConnectedWitness.relationships!.byId.set(spreader.id, 0.5);

    spreader.intentions!.queue = [{ kind: "rumor", data: { targetId: target.id }, priority: 1 }];
    h.step(0); // tick 0: ACT emits RUMOR, buffered by the witness subscriber
    h.step(1); // tick 1: witness.run() applies the buffered tick-0 rumor

    expect(nearbyWitness.relationships!.byId.get(target.id)!).toBeCloseTo(0.5 - RUMOR_TRUST_DELTA, 6);
    expect(distantConnectedWitness.relationships!.byId.get(target.id)!).toBeCloseTo(
      0.5 - RUMOR_TRUST_DELTA * RUMOR_CONNECTED_FACTOR,
      6,
    );
    // Distance decay: the connected-but-far witness is affected LESS than the near one...
    expect(
      0.5 - distantConnectedWitness.relationships!.byId.get(target.id)!,
    ).toBeLessThan(0.5 - nearbyWitness.relationships!.byId.get(target.id)!);
    // ...and the distant, unconnected witness isn't affected at all.
    expect(distantUnconnectedWitness.relationships!.byId.get(target.id) ?? 0.5).toBe(0.5);
    // Neither the spreader nor the target themselves are touched by this fold.
    expect(target.relationships!.byId.get(spreader.id) ?? 0.5).toBe(0.5);
  });

  it("steal: a detected theft's trust hit reaches a nearby witness, not just the direct victim", () => {
    const h = makeHarness();
    const thief = h.spawn(0, 0);
    const victim = h.spawn(0, 0);
    victim.inventory!.goods[GOOD_FOOD] = 10;
    const witness = h.spawn(1, 0); // within WITNESS_PROXIMITY_TILES

    thief.intentions!.queue = [{ kind: "steal", data: { targetId: victim.id, good: GOOD_FOOD, amount: 5 }, priority: 1 }];
    h.step(0); // ACT executes the steal (forced-detected) and emits STEAL_DETECTED
    expect(victim.relationships!.byId.get(thief.id)!).toBeLessThan(0.5); // direct hit, same tick
    h.step(1); // witness folds the buffered STEAL_DETECTED

    expect(witness.relationships!.byId.get(thief.id)!).toBeCloseTo(0.5 - STEAL_WITNESS_TRUST_DELTA, 6);
  });
});
