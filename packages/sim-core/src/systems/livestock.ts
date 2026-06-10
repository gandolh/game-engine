/**
 * brief 42 — LivestockSystem
 *
 * Runs once per day-boundary (DAY_START signal pattern from CropGrowthSystem).
 * For each pen in the world:
 *  1. If fed+tended today → produce count × yield of its product into the owner's
 *     inventory at quality determined by care + seeded rng.
 *  2. Decay care (fast if unfed, slow otherwise).
 *  3. Reset fedToday flag.
 *
 * Quality from care mirrors computeQuality in harvest.ts but is simpler: care
 * alone (0–1) replaces the multi-factor husbandry score, then a seeded rng roll
 * determines the tier.
 */
import type { SimContext, System, World, Rng, With } from "@engine/core";
import type { GameEntity, CropQuality } from "../components";
import { ONT_SIMULATION } from "../protocols";
import {
  ANIMAL_PRODUCT,
  PRODUCT_YIELD_PER_ANIMAL,
  CARE_DECAY_RATE,
  CARE_DECAY_UNFED,
  bankProduct,
} from "../economy";

/** Thresholds for quality from care (care is 0–1). */
const GOLD_CARE_THRESHOLD   = 0.82;
const SILVER_CARE_THRESHOLD = 0.55;

/** Derive product quality from care scalar + seeded rng roll. */
function computeProductQuality(care: number, rng: Rng): CropQuality {
  const roll = rng.nextFloat();
  if (care >= GOLD_CARE_THRESHOLD && roll < care - 0.10) return "gold";
  if (care >= SILVER_CARE_THRESHOLD && roll < care + 0.10) return "silver";
  return "normal";
}

export class LivestockSystem implements System {
  readonly name = "LivestockSystem";
  private lastDayProcessed = -1;
  private readonly productRng: Rng;

  constructor(
    private readonly world: World<GameEntity>,
    rng: Rng,
  ) {
    this.productRng = rng.fork("livestock");
  }

  run(_ctx: SimContext): void {
    // Detect day boundary (same pattern as CropGrowthSystem).
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

    // Build a lookup of inventory by ownerId.
    const inventoryByOwner = new Map<number, GameEntity>();
    for (const f of this.world.query("inventory", "farmer")) {
      if (f.id !== undefined) inventoryByOwner.set(f.id, f);
    }

    // Process each pen in entity-id order for determinism.
    const pens: With<GameEntity, "pen">[] = [];
    for (const p of this.world.query("pen")) pens.push(p);
    pens.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    for (const penEntity of pens) {
      const pen = penEntity.pen;
      const owner = inventoryByOwner.get(pen.ownerId);
      if (!owner?.inventory) continue;

      const productKind = ANIMAL_PRODUCT[pen.animal];
      const baseYield = PRODUCT_YIELD_PER_ANIMAL[pen.animal];

      if (pen.fedToday) {
        // Produce: count × baseYield units at quality from care.
        const quality = computeProductQuality(pen.care, this.productRng);
        const qty = pen.count * baseYield;
        bankProduct(owner.inventory, productKind, qty, quality);
        // Care decays slowly after a fed day.
        pen.care = Math.max(0, pen.care - CARE_DECAY_RATE);
      } else {
        // Unfed: no yield, faster care decay.
        pen.care = Math.max(0, pen.care - CARE_DECAY_UNFED);
      }

      // Reset fedToday for the next day.
      pen.fedToday = false;
    }
  }
}
