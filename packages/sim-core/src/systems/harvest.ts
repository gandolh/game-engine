import type { SimContext, System, World, Rng } from "@engine/core";
import type { GameEntity, PlotState, CropQuality } from "../components";
import { DECORATION_RECIPE, MAX_DECORATION_BOOST } from "../components";
import { bankHarvest } from "../economy";
import { farmingQualityBonus, grantSkillXp } from "./skills";

export const HARVEST_FARMING_XP = 2; // farming XP per harvested plot

/**
 * Compute quality tier deterministically at harvest from husbandry inputs + seeded rng.
 * Husbandry score (0–1): water recency (50%), growth completeness (30%), weather avg (20%).
 * Gold threshold = 0.82, silver = 0.52; decorationBoost and farmingBonus shift the score.
 */
export function computeQuality(
  daysGrowing: number,
  growthDays: number,
  weatherSum: number,
  daysSinceWater: number,
  decorationBoost: number,
  rng: Rng,
  farmingBonus = 0, // additive shift from owner's farming skill; see farmingQualityBonus
): CropQuality {
  const dryDays = daysSinceWater;
  const waterScore = Math.max(0, 1 - dryDays * 0.4); // 1.0 if watered last day, degrades linearly
  const growthScore = Math.min(1, daysGrowing / Math.max(1, growthDays));
  const weatherScore = daysGrowing > 0 ? Math.min(1, (weatherSum / daysGrowing) / 1.2) : 0.5;

  const husbandry = waterScore * 0.5 + growthScore * 0.3 + weatherScore * 0.2;
  const effectiveHusbandry = Math.min(1, husbandry + decorationBoost * 0.3 + farmingBonus);

  const roll = rng.nextFloat();

  const GOLD_THRESHOLD   = 0.82;
  const SILVER_THRESHOLD = 0.52;

  if (effectiveHusbandry >= GOLD_THRESHOLD && roll < effectiveHusbandry - 0.1) {
    return "gold";
  }
  if (effectiveHusbandry >= SILVER_THRESHOLD && roll < effectiveHusbandry + 0.1) {
    return "silver";
  }
  return "normal";
}

export class HarvestSystem implements System {
  readonly name = "HarvestSystem";

  private readonly qualityRng: Rng | null;

  constructor(
    private readonly world: World<GameEntity>,
    rng?: Rng,
  ) {
    this.qualityRng = rng ? rng.fork("crop-quality") : null;
  }

  run(_ctx: SimContext): void {
    const plots = this.world.query("plot");
    const farmersById = new Map<number, GameEntity>();
    for (const f of this.world.query("inventory", "farmer")) {
      if (f.id !== undefined) farmersById.set(f.id, f);
    }

    const boostByOwner = new Map<number, number>();
    for (const e of this.world.query("farmDecoration")) {
      const id = e.farmDecoration.ownerId;
      const add = DECORATION_RECIPE[e.farmDecoration.kind]?.yieldBoost ?? 0;
      boostByOwner.set(id, Math.min(MAX_DECORATION_BOOST, (boostByOwner.get(id) ?? 0) + add));
    }

    for (const plot of plots) {
      const state = plot.plot.state;
      if (state.kind !== "planted") continue;
      const currentDay = (this.findOwnerDay(plot.plot.ownerId, farmersById) ?? state.daysGrowing) | 0;
      if (currentDay < state.readyAtDay) continue;
      const owner = farmersById.get(plot.plot.ownerId);
      if (!owner || !owner.inventory) continue;

      const boost = boostByOwner.get(plot.plot.ownerId) ?? 0;
      const yield_ = Math.round(2 * (1 + boost));

      let quality: CropQuality = "normal";
      if (this.qualityRng) {
        quality = computeQuality(
          state.daysGrowing,
          currentDay - (state.readyAtDay - (state.daysGrowing | 0)), // approx growthDays
          state.weatherSum,
          state.daysSinceWater ?? 0,
          boost,
          this.qualityRng,
          farmingQualityBonus(owner.skills?.farming ?? 0),
        );
      }

      bankHarvest(owner.inventory, state.crop, yield_, quality);
      grantSkillXp(owner, "farming", HARVEST_FARMING_XP);
      plot.plot.state = { kind: "empty" } satisfies PlotState;
    }
  }

  private findOwnerDay(
    ownerId: number,
    farmersById: Map<number, GameEntity>,
  ): number | undefined {
    const f = farmersById.get(ownerId);
    if (!f || !f.beliefs) return undefined;
    return f.beliefs.data.currentDay as number | undefined;
  }
}
