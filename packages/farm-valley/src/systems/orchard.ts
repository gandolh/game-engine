/**
 * brief 42 — OrchardSystem
 *
 * Runs once per day-boundary (DAY_START signal pattern).
 * For each orchardTree in the world:
 *  1. If not mature: accrue daysGrown (1/day; no watering required). Once
 *     daysGrown >= ORCHARD_MATURATION_DAYS the tree becomes mature.
 *  2. If mature: at each season-start that matches the tree's FRUIT_SEASON,
 *     produce FRUIT_YIELD_PER_HARVEST fruit into fruitReady (clamped once per
 *     season — gated by lastHarvestDay). The farmer must explicitly harvest
 *     via the `harvest-fruit` action.
 *
 * Orchard trees do NOT wither or need watering. They are perennial.
 */
import type { SimContext, System, World, With } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION } from "../protocols";
import { seasonForDay } from "../protocols/weather";
import {
  ORCHARD_MATURATION_DAYS,
  FRUIT_SEASON,
  FRUIT_YIELD_PER_HARVEST,
} from "../economy";

/** Days in a season (4 seasons × seasonLength days/season = 100 days total → 25 days/season). */
const DAYS_PER_SEASON = 25;

export class OrchardSystem implements System {
  readonly name = "OrchardSystem";
  private lastDayProcessed = -1;

  constructor(private readonly world: World<GameEntity>) {}


  run(_ctx: SimContext): void {
    // Detect day boundary.
    const stations = this.world.query("weatherStation", "inbox");
    let newDay: number | null = null;
    for (const station of stations) {
      for (const msg of station.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const day = (msg.body as { day: number }).day;
          if (day > this.lastDayProcessed) newDay = day;
        }
      }
      break;
    }
    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    // Process each orchard tree in entity-id order for determinism.
    const trees: With<GameEntity, "orchardTree">[] = [];
    for (const t of this.world.query("orchardTree")) trees.push(t);
    trees.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    const currentSeason = seasonForDay(newDay);

    for (const treeEntity of trees) {
      const tree = treeEntity.orchardTree;

      if (!tree.mature) {
        // Maturation: accrue 1 day of growth.
        tree.daysGrown += 1;
        if (tree.daysGrown >= ORCHARD_MATURATION_DAYS) {
          tree.mature = true;
        }
        continue;
      }

      // Mature tree: check if it should fruit this season.
      const yieldSeason = FRUIT_SEASON[tree.kind];
      if (currentSeason !== yieldSeason) continue;

      // Fruit once per 25-day season BLOCK (so perennial: fires each spring,
      // not just the first one). Gate by checking if lastHarvestDay is in the
      // same season block (0-indexed from day 0) as newDay.
      // Both day 0 and day 1 are in block 0 (spring, first cycle).
      // Day 101 is in block 4 (spring, second cycle) → different block → re-fruit.
      const lastBlock =
        tree.lastHarvestDay < 0
          ? -1
          : Math.floor(Math.max(0, tree.lastHarvestDay - 1) / DAYS_PER_SEASON);
      const currentBlock = Math.floor(Math.max(0, newDay - 1) / DAYS_PER_SEASON);
      if (lastBlock === currentBlock) continue; // already fruited this season block

      // Fruit-drop: accumulate into fruitReady (farmer must harvest explicitly).
      tree.fruitReady += FRUIT_YIELD_PER_HARVEST;
      // Record the day of this fruit-drop so we don't drop again this season.
      tree.lastHarvestDay = newDay;
    }
  }
}
