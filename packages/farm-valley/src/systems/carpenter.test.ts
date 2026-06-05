import { ZERO_CROPS } from "../economy";
import { describe, it, expect, beforeEach } from "vitest";
import { World, MessageBus } from "@engine/core";
import type { GameEntity, FarmerFsmState } from "../components";
import { CarpenterSystem, COMMISSION_BUILD_TICKS } from "./carpenter";
import { ActSystem } from "./act";
import { InboxDispatchSystem } from "./inbox-dispatch";
import { ONT_COMMISSION, type CommissionBuildBody } from "../protocols/commission";
import { PERFORMATIVE } from "../protocols/performatives";

function makeCarpenter(world: World<GameEntity>): GameEntity {
  return world.spawn({
    transform: { x: 24, y: 38, prevX: 24, prevY: 38, rotation: 0 },
    carpenter: { isCarpenter: true },
    inbox: { messages: [] },
  });
}

function makeFarmer(
  world: World<GameEntity>,
  opts: { wood?: number } = {},
): GameEntity {
  return world.spawn({
    farmer: { name: "Atticus", currentRegion: "carpentry" as const, homeRegion: "farm-atticus" as const },
    fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
    intentions: { queue: [] },
    inventory: { gold: 100, crops: { ...ZERO_CROPS }, seeds: { ...ZERO_CROPS } },
    resources: { wood: opts.wood ?? 10, stone: 0, ironOre: 0, geodes: 0 },
    beliefs: { data: { currentDay: 5 }, revision: 0 },
    transform: { x: 24, y: 38, prevX: 24, prevY: 38, rotation: 0 },
  });
}

function commission(world: World<GameEntity>, carpenter: GameEntity, senderId: number, kind: string): void {
  carpenter.inbox!.messages.push({
    performative: PERFORMATIVE.REQUEST,
    ontology: ONT_COMMISSION.BUILD,
    sender: senderId,
    body: { kind } as unknown as Record<string, unknown>,
    tickIssued: 0,
  });
}

describe("CarpenterSystem", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: CarpenterSystem;
  let carpenter: GameEntity;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    sys = new CarpenterSystem(world, bus);
    carpenter = makeCarpenter(world);
  });

  it("delivers a commissioned decoration after the build-time and escrows the wood", () => {
    const farmer = makeFarmer(world, { wood: 5 }); // scarecrow needs 3 wood
    commission(world, carpenter, farmer.id!, "scarecrow");

    // Tick 1: accept the order — wood escrowed now, no decoration yet.
    sys.run({ tick: 0 } as never);
    expect(farmer.resources!.wood).toBe(2); // 5 - 3 escrowed
    expect([...world.query("farmDecoration")].length).toBe(0);
    expect(carpenter.carpenter!.pending!.length).toBe(1);

    // Run out the build-time; the decoration appears on delivery.
    for (let t = 1; t <= COMMISSION_BUILD_TICKS; t++) sys.run({ tick: t } as never);
    const decorations = [...world.query("farmDecoration")];
    expect(decorations.length).toBe(1);
    expect(decorations[0]!.farmDecoration!.kind).toBe("scarecrow");
    expect(decorations[0]!.farmDecoration!.ownerId).toBe(farmer.id);
    expect(decorations[0]!.farmDecoration!.regionId).toBe("farm-atticus");
    expect(carpenter.carpenter!.pending!.length).toBe(0);
  });

  it("rejects a commission when the farmer lacks the wood (no escrow, no build)", () => {
    const farmer = makeFarmer(world, { wood: 1 }); // scarecrow needs 3
    commission(world, carpenter, farmer.id!, "scarecrow");
    sys.run({ tick: 0 } as never);
    expect(farmer.resources!.wood).toBe(1); // untouched
    expect(carpenter.carpenter!.pending ?? []).toHaveLength(0);
  });

  it("end-to-end: a commission-build act drives a delivered structure", () => {
    const act = new ActSystem(world, bus);
    const dispatch = new InboxDispatchSystem(bus, world);
    const farmer = makeFarmer(world, { wood: 12 });
    farmer.intentions!.queue.push({ kind: "commission-build", data: { kind: "windmill" }, priority: 0 });

    // ActSystem sends the BUILD message via the bus.
    act.run({ tick: 0 } as never);
    // InboxDispatchSystem flushes it into the carpenter inbox next tick.
    dispatch.run({ tick: 1 } as never);
    // CarpenterSystem accepts + builds.
    for (let t = 1; t <= COMMISSION_BUILD_TICKS + 1; t++) sys.run({ tick: t } as never);

    const decorations = [...world.query("farmDecoration")];
    expect(decorations.length).toBe(1);
    expect(decorations[0]!.farmDecoration!.kind).toBe("windmill");
  });
});
