import { describe, it, expect } from "vitest";
import { World, createRng } from "@engine/core";
import type { GameEntity, PlotState } from "../../components";
import { ZERO_CROPS, GROWTH_DAYS } from "../../economy";
import { HarvestSystem } from "./harvest";

const N = 150;
const TIER_SCORE = { gold: 2, silver: 1, normal: 0 } as const;

function spawnFarmerWithPlot(
  world: World<GameEntity>,
  state: PlotState,
): GameEntity {
  const farmer = world.spawn({
    farmer: { name: "F", currentRegion: "farm-atticus" as const },
    inventory: { gold: 0, crops: { ...ZERO_CROPS }, seeds: { ...ZERO_CROPS } },
  });
  world.spawn({
    plot: { ownerId: farmer.id!, regionId: "farm-atticus" as const, tileX: 0, tileY: 0, state },
  });
  return farmer;
}

function averageQualityScore(world: World<GameEntity>, farmers: GameEntity[], crop: "wheat"): number {
  let total = 0;
  let count = 0;
  for (const f of farmers) {
    const q = f.inventory!.cropQuality?.[crop];
    if (!q) continue;
    for (const tier of ["gold", "silver", "normal"] as const) {
      total += TIER_SCORE[tier] * q[tier];
      count += q[tier];
    }
  }
  return count === 0 ? 0 : total / count;
}

describe("HarvestSystem crop quality", () => {
  it("scores an out-of-season (under-grown) crop measurably lower than the same crop grown fully in-season", () => {
    const crop = "wheat" as const;
    const fullGrowth = GROWTH_DAYS[crop];
    const halfGrowth = fullGrowth / 2;

    const worldInSeason = new World<GameEntity>();
    const inSeasonFarmers: GameEntity[] = [];
    for (let i = 0; i < N; i++) {
      inSeasonFarmers.push(
        spawnFarmerWithPlot(worldInSeason, {
          kind: "planted",
          crop,
          daysGrowing: fullGrowth,
          readyAtDay: fullGrowth,
          weatherSum: fullGrowth * 1.2,
          daysSinceWater: 0,
        }),
      );
    }
    new HarvestSystem(worldInSeason, createRng(1)).run({ tick: 0 } as never);

    const worldOutOfSeason = new World<GameEntity>();
    const outOfSeasonFarmers: GameEntity[] = [];
    for (let i = 0; i < N; i++) {
      outOfSeasonFarmers.push(
        spawnFarmerWithPlot(worldOutOfSeason, {
          kind: "planted",
          crop,
          daysGrowing: halfGrowth,
          readyAtDay: halfGrowth,
          weatherSum: halfGrowth * 1.2,
          daysSinceWater: 0,
        }),
      );
    }
    new HarvestSystem(worldOutOfSeason, createRng(1)).run({ tick: 0 } as never);

    const inSeasonAvg = averageQualityScore(worldInSeason, inSeasonFarmers, crop);
    const outOfSeasonAvg = averageQualityScore(worldOutOfSeason, outOfSeasonFarmers, crop);

    expect(outOfSeasonAvg).toBeLessThan(inSeasonAvg - 0.15);
  });
});
