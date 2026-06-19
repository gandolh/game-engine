import { describe, it, expect } from "vitest";
import { World, MessageBus, createRng } from "@engine/core";
import type { GameEntity, FarmerFsmState, CropKind } from "../../../components";
import { ZERO_CROPS } from "../../../economy";
import { ActSystem } from "../system";
import { SEED_WEIGHTS, pickWeightedSeed } from "../seed-drops";

const CROP_KINDS = Object.keys(ZERO_CROPS) as CropKind[];

function spawnFarmer(world: World<GameEntity>, atX: number, atY: number): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: "forest-north" as const },
    fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
    intentions: { queue: [] },
    transform: { x: atX, y: atY, prevX: atX, prevY: atY, rotation: 0 },
    inventory: {
      gold: 0,
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS },
      tools: [{ kind: "axe", tier: "wooden", durability: 999 }],
    },
    resources: { wood: 0, stone: 0, ironOre: 0, geodes: 0 },
    beliefs: { data: { currentDay: 0 }, revision: 0 },
  });
}

function spawnFeature(world: World<GameEntity>, kind: "tree" | "bush", x: number, y: number): GameEntity {
  return world.spawn({
    transform: { x, y, prevX: x, prevY: y, rotation: 0 },
    sprite: { atlasId: "main", frame: kind === "tree" ? "structure/tree" : "structure/bush", layer: 30, tintRgba: 0xffffffff },
    tileFeature: { kind, tileX: x, tileY: y, regionId: "forest-north", ownerId: 1 },
  });
}

function totalSeeds(e: GameEntity): number {
  return CROP_KINDS.reduce((s, c) => s + (e.inventory!.seeds[c] ?? 0), 0);
}

describe("pickWeightedSeed", () => {
  it("only ever returns a valid crop kind", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      expect(CROP_KINDS).toContain(pickWeightedSeed(rng));
    }
  });

  it("skews toward the cheap common crops (radish more likely than grape)", () => {
    const rng = createRng(7);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const k = pickWeightedSeed(rng);
      counts[k] = (counts[k] ?? 0) + 1;
    }

    expect(counts.radish!).toBeGreaterThan(counts.grape! * 5);
    expect(SEED_WEIGHTS.radish).toBeGreaterThan(SEED_WEIGHTS.grape);
  });
});

describe("gather-bush act handler", () => {
  it("forages an adjacent bush for exactly one seed and despawns it", () => {
    const world = new World<GameEntity>();
    const sys = new ActSystem(world, createRng(1));
    const farmer = spawnFarmer(world, 5, 4); 
    const bush = spawnFeature(world, "bush", 5, 5);

    farmer.intentions!.queue.push({ kind: "gather-bush", data: { tileX: 5, tileY: 5 }, priority: 0 });
    sys.run({ tick: 1 });

    expect(totalSeeds(farmer)).toBe(1);
    expect([...world.query("tileFeature")]).not.toContain(bush);
  });

  it("does nothing when the bush is out of reach", () => {
    const world = new World<GameEntity>();
    const sys = new ActSystem(world, createRng(1));
    const farmer = spawnFarmer(world, 0, 0); 
    spawnFeature(world, "bush", 5, 5);

    farmer.intentions!.queue.push({ kind: "gather-bush", data: { tileX: 5, tileY: 5 }, priority: 0 });
    sys.run({ tick: 1 });

    expect(totalSeeds(farmer)).toBe(0);
    expect([...world.query("tileFeature")]).toHaveLength(1);
  });
});

describe("chop-tree seed bonus", () => {
  it("yields 2 wood per tree and an occasional bonus seed (~20%)", () => {
    const world = new World<GameEntity>();
    const sys = new ActSystem(world, createRng(42));
    const farmer = spawnFarmer(world, 5, 4);

    const N = 300;
    for (let i = 0; i < N; i++) {
      spawnFeature(world, "tree", 5, 5);
      farmer.fsm!.current = "ACT";
      farmer.intentions!.queue.push({ kind: "chop-tree", data: { tileX: 5, tileY: 5 }, priority: 0 });
      sys.run({ tick: i + 1 });
    }

    expect(farmer.resources!.wood).toBe(2 * N);
    const seeds = totalSeeds(farmer);

    expect(seeds).toBeGreaterThan(N * 0.1);
    expect(seeds).toBeLessThan(N * 0.32);
  });
});
