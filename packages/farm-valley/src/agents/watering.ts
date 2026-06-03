import type { GameEntity } from "../components";
import { recordReason } from "../components";
import type { PlotWaterSense } from "../systems/plot-sense";

/**
 * brief 29 — survival-reflex watering, shared by all four personalities and
 * called from each `deliberate*`. Watering is a baseline priority (a crop dies
 * after DRY_DEATH_GRACE_DAYS=2 dry days), so every personality waters its due
 * plots BEFORE discretionary actions. Personality flavors only the *timing*:
 *
 *   dryThreshold — water a due plot once its dryness reaches this many days.
 *     0 = water every day (never risk the grace window; conservative/hoarder).
 *     1 = wait a day before watering, banking AP (opportunist; aggressive who
 *         may let a marginal plot slip).
 *   maxWaterPerDay — cap on watering actions queued (aggressive over-plants and
 *     won't tend every plot). undefined = water all due plots.
 *
 * Watering intents get a high-importance (low number) priority so the AP pruner
 * keeps them over discretionary actions. Each `water` intent tends one plot
 * (ActSystem waters the most-dry due plot), so we queue up to `due` of them.
 */
export interface WateringStyle {
  dryThreshold: number;
  maxWaterPerDay?: number;
}

export function deliberateWatering(farmer: GameEntity, style: WateringStyle): void {
  const sense = farmer.beliefs?.data.plotWater as PlotWaterSense | undefined;
  if (!sense || sense.due <= 0) return;
  // Only water once the driest plot has reached the personality's threshold,
  // EXCEPT always water if something is one day from wilting (grace - 1).
  const urgent = sense.maxDrySoFar >= 2; // grace is 2; at 2 dry days it's last chance
  if (!urgent && sense.maxDrySoFar < style.dryThreshold) return;

  const cap = style.maxWaterPerDay ?? sense.due;
  const count = Math.min(sense.due, cap);
  for (let i = 0; i < count; i++) {
    farmer.intentions!.queue.push({
      kind: "water",
      data: {},
      priority: 0, // survival — most important, watered first
    });
  }
  if (count > 0) {
    recordReason(
      farmer,
      `water ${count} plot${count > 1 ? "s" : ""}${urgent ? " (wilting!)" : ""}`,
    );
  }
}
