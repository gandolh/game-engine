// Runs once per day. Matures trees after ORCHARD_MATURATION_DAYS (no watering needed),
// then drops FRUIT_YIELD_PER_HARVEST once per 25-day season block into fruitReady.
import type { SimContext, System, World, With } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION } from "../protocols";
import { seasonForDay } from "../protocols/weather";
import {
  ORCHARD_MATURATION_DAYS,
  FRUIT_SEASON,
  FRUIT_YIELD_PER_HARVEST,
} from "../economy";

const DAYS_PER_SEASON = 25; // 4 seasons × 25 days = 100-day run

export class OrchardSystem implements System {
  readonly name = "OrchardSystem";
  private lastDayProcessed = -1;

  constructor(private readonly world: World<GameEntity>) {}


  run(_ctx: SimContext): void {
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

    const trees: With<GameEntity, "orchardTree">[] = []; // sorted by entity-id for determinism
    for (const t of this.world.query("orchardTree")) trees.push(t);
    trees.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    const currentSeason = seasonForDay(newDay);

    for (const treeEntity of trees) {
      const tree = treeEntity.orchardTree;

      if (!tree.mature) {
        tree.daysGrown += 1;
        if (tree.daysGrown >= ORCHARD_MATURATION_DAYS) {
          tree.mature = true;
          // Swap sapling → mature fruit-tree look. resolveFrameAndBob then remaps
          // this to the seasonal variant (blossom/green/autumn/bare) at render time.
          if (treeEntity.sprite) treeEntity.sprite.frame = "structure/fruit-tree";
        }
        continue;
      }

      const yieldSeason = FRUIT_SEASON[tree.kind];
      if (currentSeason !== yieldSeason) continue;

      // Fruit once per 25-day season block; gates re-fruting each cycle.
      // Block 0 = days 0-24, block 4 = days 100-124 (second spring) → re-fruit.
      const lastBlock =
        tree.lastHarvestDay < 0
          ? -1
          : Math.floor(Math.max(0, tree.lastHarvestDay - 1) / DAYS_PER_SEASON);
      const currentBlock = Math.floor(Math.max(0, newDay - 1) / DAYS_PER_SEASON);
      if (lastBlock === currentBlock) continue; // already fruited this season block

      tree.fruitReady += FRUIT_YIELD_PER_HARVEST;
      tree.lastHarvestDay = newDay;
    }
  }
}
