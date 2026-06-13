import { describe, it, expect, beforeEach } from "vitest";
import { World, createRng, MessageBus } from "@engine/core";
import type { GameEntity } from "../../components";
import { CombatSystem } from "./system";
import { ChaseSystem } from "./chase";
import { AggressionSystem } from "./aggression";
import { pursuitWindowTicks } from "./constants";

const ZERO = {
  radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0,
} as const;

function makeFarmer(
  world: World<GameEntity>,
  opts: { x?: number; y?: number; region?: string; player?: boolean } = {},
): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: (opts.region ?? "village") as never },
    fsm: { current: "WAIT_DAY", enteredTick: 0 },
    inbox: { messages: [] },
    intentions: { queue: [] },
    trust: { byId: new Map<number, number>() },
    transform: { x: opts.x ?? 0, y: opts.y ?? 0, prevX: opts.x ?? 0, prevY: opts.y ?? 0, rotation: 0 },
    health: { current: 40, max: 40 },
    ap: { current: 100, max: 100, penaltyPending: false, penaltyCapacity: 50, away: false },
    inventory: { gold: 100, crops: { ...ZERO }, seeds: { ...ZERO } },
    ...(opts.player ? { player: { isPlayer: true as const, facing: "down" as const, pendingMoveX: null, pendingMoveY: null, pendingAction: false, selectedSlot: 0, pendingActionTile: null } } : {}),
  });
}

function rigs(world: World<GameEntity>, seed = 1) {
  const bus = new MessageBus();
  const combat = new CombatSystem(world, bus, createRng(seed), 50);
  const aggression = new AggressionSystem(world, combat);
  const chase = new ChaseSystem(world, bus, combat, 50);
  return { bus, combat, aggression, chase };
}

describe("AggressionSystem", () => {
  let world: World<GameEntity>;
  beforeEach(() => { world = new World<GameEntity>(); });

  it("starts a chase against a co-located rival (trust < cutoff)", () => {
    const a = makeFarmer(world);
    const b = makeFarmer(world);
    a.trust!.byId.set(b.id!, 0.1); 
    const { aggression } = rigs(world);
    aggression.run({ tick: 0 });
    expect(a.farmer!.chaseTarget?.peerId).toBe(b.id);

    expect(b.farmer!.chaseTarget).toBeUndefined();
  });

  it("does NOT chase a non-rival, a different-region peer, or when Pip", () => {
    const a = makeFarmer(world);
    const friend = makeFarmer(world);
    a.trust!.byId.set(friend.id!, 0.6); 
    const offRegionRival = makeFarmer(world, { region: "farm-cora" });
    a.trust!.byId.set(offRegionRival.id!, 0.05);
    const pip = makeFarmer(world, { player: true });
    const pipRival = makeFarmer(world);
    pip.trust!.byId.set(pipRival.id!, 0.05);
    const { aggression } = rigs(world);
    aggression.run({ tick: 0 });
    expect(a.farmer!.chaseTarget).toBeUndefined();   
    expect(pip.farmer!.chaseTarget).toBeUndefined();  
  });
});

describe("ChaseSystem", () => {
  let world: World<GameEntity>;
  beforeEach(() => { world = new World<GameEntity>(); });

  it("issues a CHALLENGE and clears the chase when within reach", () => {
    const a = makeFarmer(world, { x: 5, y: 5 });
    const b = makeFarmer(world, { x: 5, y: 6 }); 
    a.trust!.byId.set(b.id!, 0.1);
    const { combat, chase } = rigs(world);
    a.farmer!.chaseTarget = { peerId: b.id!, startTick: 0 };
    chase.run({ tick: 1 });

    expect(a.farmer!.chaseTarget).toBeUndefined();

    b.inbox!.messages.push({ performative: "request", ontology: "combat.challenge", sender: a.id!, body: { challengerId: a.id!, context: "street" }, tickIssued: 1 } as never);
    combat.run({ tick: 2 });
    expect(combat.isFighting(a.id!)).toBe(true);
  });

  it("gives up after the pursuit window expires", () => {
    const a = makeFarmer(world, { x: 0, y: 0 });
    const b = makeFarmer(world, { x: 100, y: 100 }); 
    a.trust!.byId.set(b.id!, 0.1);
    const { chase } = rigs(world);
    const startTick = 0;
    a.farmer!.chaseTarget = { peerId: b.id!, startTick };
    const window = pursuitWindowTicks(50);

    chase.run({ tick: startTick + 1 });
    expect(a.farmer!.chaseTarget).toBeDefined();

    chase.run({ tick: startTick + window });
    expect(a.farmer!.chaseTarget).toBeUndefined();
  });

  it("marks the target as fleeing while pursued", () => {
    const a = makeFarmer(world, { x: 0, y: 0 });
    const b = makeFarmer(world, { x: 50, y: 50 });
    a.trust!.byId.set(b.id!, 0.1);
    const { chase } = rigs(world);
    a.farmer!.chaseTarget = { peerId: b.id!, startTick: 0 };
    chase.run({ tick: 1 });
    expect(b.farmer!.fleeingFrom?.peerId).toBe(a.id);
  });
});
