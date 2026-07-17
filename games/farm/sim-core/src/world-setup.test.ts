import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import type { GameEntity, CropKind, Inventory } from "./components";
import { setupFarmer, type FarmerSpec } from "./world-setup";
import { CROP_SELL_PRICE } from "./economy";

// setupFarmer always spawns the `inventory` component; this narrows the
// optional-on-GameEntity type for the test assertions below.
function inv(farmer: GameEntity): Inventory {
  if (!farmer.inventory) throw new Error("expected farmer to have an inventory");
  return farmer.inventory;
}

// Brief 2026-07-16 (farm-starting-crop-surplus): every farmer must spawn
// holding 1-2 units of a sellable crop so OFFER_CROP peer trades have stock
// to close against in days 1-15 (brief 70 found the binding constraint was
// `no-stock`, not gold — so starting gold must stay untouched here).

function makeSpec(name: string, personality: FarmerSpec["personality"] = "conservative"): FarmerSpec {
  return {
    name,
    personality,
    homeRegion: "farm-cora",
    homeX: 0,
    homeY: 0,
    startGold: 80,
    riskProfile: "low",
    minGoldReserve: 30,
    startSeeds: { radish: 3 },
  };
}

function totalCrops(farmer: GameEntity): number {
  return (Object.values(inv(farmer).crops) as number[]).reduce((a, b) => a + b, 0);
}

describe("starting crop surplus", () => {
  it("seeds every farmer with 1-2 units of a single sellable crop", () => {
    const world = new World<GameEntity>();
    const farmer = setupFarmer(world, makeSpec("Cora"), 0xc0ffee);

    const total = totalCrops(farmer);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(2);

    const crops = inv(farmer).crops;
    const stocked = (Object.keys(crops) as CropKind[]).filter(c => crops[c] > 0);
    expect(stocked.length).toBe(1);
    const crop = stocked[0]!;
    expect(CROP_SELL_PRICE[crop]).toBeGreaterThan(0);

    // banked via bankHarvest, so cropQuality tracks it as normal-quality stock
    // in lockstep with crops[]
    expect(inv(farmer).cropQuality?.[crop]?.normal).toBe(crops[crop]);
  });

  it("does not touch starting gold or seeds", () => {
    const world = new World<GameEntity>();
    const spec = makeSpec("Atticus", "aggressive");
    const farmer = setupFarmer(world, spec, 7);

    expect(inv(farmer).gold).toBe(spec.startGold);
    expect(inv(farmer).seeds.radish).toBe(spec.startSeeds.radish);
  });

  it("is deterministic: same seed + name reproduces the same surplus", () => {
    const worldA = new World<GameEntity>();
    const a = setupFarmer(worldA, makeSpec("Cora"), 42);
    const worldB = new World<GameEntity>();
    const b = setupFarmer(worldB, makeSpec("Cora"), 42);

    expect(inv(b).crops).toEqual(inv(a).crops);
    expect(inv(b).cropQuality).toEqual(inv(a).cropQuality);
  });

  it("varies deterministically across farmer names under the same seed", () => {
    const world = new World<GameEntity>();
    const names = ["Cora", "Atticus", "Hannah", "Otto", "Pip"];
    const surpluses = names.map(name => {
      const farmer = setupFarmer(world, makeSpec(name), 0xbeef);
      const crops = inv(farmer).crops;
      const crop = (Object.keys(crops) as CropKind[]).find(c => crops[c] > 0)!;
      return `${crop}:${crops[crop]}`;
    });

    // Not all farmers should land on the identical crop+qty pick under a
    // shared seed — the per-farmer Rng fork (`starting-surplus:${name}`)
    // should diversify the pick.
    expect(new Set(surpluses).size).toBeGreaterThan(1);
  });

  it("gives every farmer in the default roster a 1-2 unit surplus", () => {
    const world = new World<GameEntity>();
    const specs: FarmerSpec[] = [
      makeSpec("Cora", "conservative"),
      makeSpec("Atticus", "aggressive"),
      makeSpec("Hannah", "hoarder"),
      makeSpec("Otto", "opportunist"),
      makeSpec("Pip", "pip"),
    ];
    for (const spec of specs) {
      const farmer = setupFarmer(world, spec, 0xc0ffee);
      const total = totalCrops(farmer);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(2);
    }
  });
});
