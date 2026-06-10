import type { SimContext, System, World, Rng } from "@engine/core";
import type { GameEntity, PlotState, CropQuality } from "../components";
import { DECORATION_RECIPE, MAX_DECORATION_BOOST } from "../components";
import { bankHarvest } from "../economy";
import { farmingQualityBonus, grantSkillXp } from "./skills";

/** brief 43 — farming XP awarded per harvested plot. */
export const HARVEST_FARMING_XP = 2;

/**
 * brief 41 — compute quality tier deterministically at harvest.
 *
 * Husbandry score (0–1):
 *   - daysGrowing / GROWTH_DAYS: how long it actually grew (higher = more care).
 *     Capped to 1 to avoid over-rewarding very slow plots.
 *   - weatherSum / daysGrowing: average weather multiplier while growing (higher
 *     weatherSum means the crop grew in better conditions).
 *   - decorationBoost: 0–MAX_DECORATION_BOOST; better farm infrastructure helps.
 *   - daysSinceWater at harvest: lower is better (0 = watered day of harvest).
 *
 * Seeded roll (from rng.fork("crop-quality")) determines whether the husbandry
 * score clears the Silver or Gold threshold. Same inputs + same seed always
 * produce the same tier (deterministic).
 *
 * Thresholds (tuned so average-care yields Normal, good husbandry yields Silver,
 * near-perfect yields Gold):
 *   goldThreshold  = 0.85 after boost
 *   silverThreshold = 0.60 after boost
 */
export function computeQuality(
  daysGrowing: number,
  growthDays: number,
  weatherSum: number,
  daysSinceWater: number,
  decorationBoost: number,
  rng: Rng,
  /**
   * brief 43 — additive husbandry shift from the owner's farming skill (pure
   * function of farming XP; see farmingQualityBonus). 0 by default so legacy
   * callers and bare fixtures are unaffected. Pushes a skilled farmer toward
   * Silver/Gold without warping the curve (capped small in skills.ts).
   */
  farmingBonus = 0,
): CropQuality {
  // Clamp daysSinceWater (may be undefined/0 on freshly-watered crop)
  const dryDays = daysSinceWater;
  // Watering score: 1.0 if watered last day, degrades linearly with dryness (max 2 dry = grace period)
  const waterScore = Math.max(0, 1 - dryDays * 0.4);
  // Growth completeness: how close to full grow days; capped at 1.
  const growthScore = Math.min(1, daysGrowing / Math.max(1, growthDays));
  // Weather bonus: average weather multiplier (1.0 = normal, 1.2 = sunny).
  const weatherScore = daysGrowing > 0 ? Math.min(1, (weatherSum / daysGrowing) / 1.2) : 0.5;

  // Husbandry = weighted blend (water matters most, then growth, then weather).
  const husbandry = waterScore * 0.5 + growthScore * 0.3 + weatherScore * 0.2;

  // Decoration boost + farming-skill bonus shift the roll thresholds.
  const effectiveHusbandry = Math.min(1, husbandry + decorationBoost * 0.3 + farmingBonus);

  // Seeded random roll from the quality rng channel.
  const roll = rng.nextFloat();

  // Gold: high husbandry AND lucky roll; Silver: medium husbandry.
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

  /** Seeded quality RNG — forked once from the sim rng, deterministic. */
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

    // Build decoration yield boost per owner (sum of all placed decorations, capped).
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

      // Base yield 2, boosted by decorations on this farm.
      const boost = boostByOwner.get(plot.plot.ownerId) ?? 0;
      const yield_ = Math.round(2 * (1 + boost));

      // brief 41 — compute quality from husbandry inputs + seeded rng.
      // Fall back to a deterministic quality based on daysGrowing when no rng (legacy tests).
      let quality: CropQuality = "normal";
      if (this.qualityRng) {
        quality = computeQuality(
          state.daysGrowing,
          currentDay - (state.readyAtDay - (state.daysGrowing | 0)), // approx growthDays
          state.weatherSum,
          state.daysSinceWater ?? 0,
          boost,
          this.qualityRng,
          // brief 43 — owner's farming skill nudges quality up.
          farmingQualityBonus(owner.skills?.farming ?? 0),
        );
      }

      // Bank the harvested crop at its quality tier.
      bankHarvest(owner.inventory, state.crop, yield_, quality);
      // brief 43 — reward farming on every harvest (skills earned by doing).
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
