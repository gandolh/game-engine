import { ZERO_CROPS } from "../economy";
import { describe, it, expect, beforeEach } from "vitest";
import { World, MessageBus, createRng } from "@engine/core";
import type { GameEntity, FarmerFsmState } from "../components";
import { ShockSystem, defaultShockDay } from "./shock";
import { ONT_SIMULATION, type ShockBody } from "../protocols";

const TICKS_PER_DAY = 20;

function spawnFarmer(world: World<GameEntity>, name: string): GameEntity {
  return world.spawn({
    farmer: { name, currentRegion: "village" as const },
    fsm: { current: "WAIT_DAY" as FarmerFsmState, enteredTick: 0 },
    personality: { kind: "conservative" },
    inventory: {
      gold: 0,
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS },
    },
  });
}

function plantPlot(world: World<GameEntity>, ownerId: number, tileX: number): GameEntity {
  return world.spawn({
    plot: {
      ownerId,
      regionId: "farm-cora" as import("../world/regions").RegionId,
      tileX,
      tileY: 5,
      state: { kind: "planted", crop: "radish", daysGrowing: 1, readyAtDay: 3, weatherSum: 0 },
    },
  });
}

function collectShocks(bus: MessageBus): ShockBody[] {
  const out: ShockBody[] = [];
  bus.subscribeOntology(ONT_SIMULATION.SHOCK, (msg) => {
    out.push(msg.body as unknown as ShockBody);
  });
  return out;
}

function runSim(seed: number, days: number, shockDay: number): {
  world: World<GameEntity>;
  shocks: ShockBody[];
  plantedRemaining: () => number;
} {
  const world = new World<GameEntity>();
  const bus = new MessageBus();
  const f1 = spawnFarmer(world, "Cora");
  const f2 = spawnFarmer(world, "Atticus");

  plantPlot(world, f1.id!, 16);
  plantPlot(world, f1.id!, 17);
  plantPlot(world, f2.id!, 30);
  plantPlot(world, f2.id!, 31);

  const shocks = collectShocks(bus);
  const sys = new ShockSystem(bus, world, createRng(seed), TICKS_PER_DAY, {
    shockDay,
    kind: "blight",
  });

  for (let tick = 0; tick < days * TICKS_PER_DAY; tick++) {
    sys.run({ tick });
    bus.flush();
    bus.notifySubscribers();
  }

  const plantedRemaining = () => {
    let n = 0;
    for (const p of world.query("plot")) if (p.plot.state.kind === "planted") n += 1;
    return n;
  };
  return { world, shocks, plantedRemaining };
}

describe("ShockSystem (mid-game blight)", () => {
  it("defaultShockDay is the run midpoint", () => {
    expect(defaultShockDay(100)).toBe(50);
    expect(defaultShockDay(10)).toBe(5);
    expect(defaultShockDay(9)).toBe(4);
  });

  it("fires exactly once, on the shock day, wiping one farmer's planted plots", () => {
    const { shocks, plantedRemaining } = runSim(0xc0ffee, 6, 3);

    expect(shocks.length).toBe(1);
    const shock = shocks[0]!;
    expect(shock.kind).toBe("blight");
    expect(shock.day).toBe(3);
    expect(shock.plotsWiped).toBe(2); 
    expect(["Cora", "Atticus"]).toContain(shock.targetName);

    expect(plantedRemaining()).toBe(2);
  });

  it("does not fire before the shock day", () => {

    const { shocks, plantedRemaining } = runSim(0xc0ffee, 3, 3);

    expect(shocks.length).toBe(0);
    expect(plantedRemaining()).toBe(4);
  });

  it("is deterministic: same seed strikes the same farmer", () => {
    const a = runSim(0xc0ffee, 6, 3).shocks[0]!;
    const b = runSim(0xc0ffee, 6, 3).shocks[0]!;
    expect(b.targetFarmerId).toBe(a.targetFarmerId);
    expect(b.targetName).toBe(a.targetName);
  });

  it("different seeds can strike different farmers", () => {

    const base = runSim(1, 6, 3).shocks[0]!;
    const targets = new Set<number>([base.targetFarmerId]);
    for (const seed of [2, 3, 4, 5, 6, 7, 8]) {
      targets.add(runSim(seed, 6, 3).shocks[0]!.targetFarmerId);
    }
    expect(targets.size).toBeGreaterThan(1);
  });

  it("prefers a farmer with planted crops so the blight always lands", () => {

    for (const seed of [1, 2, 3, 4, 5]) {
      const w2 = new World<GameEntity>();
      const b2 = new MessageBus();
      const c2 = spawnFarmer(w2, "Cora");
      const a2 = spawnFarmer(w2, "Atticus");
      plantPlot(w2, c2.id!, 16);
      plantPlot(w2, c2.id!, 17);
      w2.spawn({
        plot: {
          ownerId: a2.id!,
          regionId: "farm-cora" as import("../world/regions").RegionId,
          tileX: 30,
          tileY: 5,
          state: { kind: "empty" },
        },
      });
      const got = collectShocks(b2);
      const s2 = new ShockSystem(b2, w2, createRng(seed), TICKS_PER_DAY, {
        shockDay: 1,
        kind: "blight",
      });
      for (let tick = 0; tick < 2 * TICKS_PER_DAY; tick++) {
        s2.run({ tick });
        b2.flush();
        b2.notifySubscribers();
      }
      expect(got[0]!.targetName).toBe("Cora");
      expect(got[0]!.plotsWiped).toBe(2);
    }
  });

  it("only wipes planted plots, leaving empty plots untouched", () => {
    const world = new World<GameEntity>();
    const bus = new MessageBus();
    const f = spawnFarmer(world, "Solo");
    plantPlot(world, f.id!, 16);

    world.spawn({
      plot: {
        ownerId: f.id!,
        regionId: "farm-cora" as import("../world/regions").RegionId,
        tileX: 17,
        tileY: 5,
        state: { kind: "empty" },
      },
    });

    const shocks = collectShocks(bus);
    const sys = new ShockSystem(bus, world, createRng(1), TICKS_PER_DAY, {
      shockDay: 1,
      kind: "blight",
    });
    for (let tick = 0; tick < 2 * TICKS_PER_DAY; tick++) {
      sys.run({ tick });
      bus.flush();
      bus.notifySubscribers();
    }

    expect(shocks[0]!.plotsWiped).toBe(1);
    for (const p of world.query("plot")) expect(p.plot.state.kind).toBe("empty");
  });
});
