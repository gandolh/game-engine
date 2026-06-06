import type { RegionId } from "../world/regions";

// ── Livestock (brief 42) ─────────────────────────────────────────────────────

/** Animals that can live in a pen. Coops hold chickens; barns hold cows or sheep. */
export type AnimalKind = "chicken" | "cow" | "sheep";

/** Products from each animal kind. */
export type ProductKind = "egg" | "milk" | "wool";

/** Pen structure — a counter-based herd with care scalar.
 * - coop: holds chickens → eggs
 * - barn: holds cows → milk, OR sheep → wool
 * `care` is 0–1; raised by `tend`, decayed daily by CARE_DECAY_RATE.
 * High care → higher product quality + no yield penalty.
 * `fedToday` is reset to false each day-start; if false at production time,
 * the pen gets no yield and care decays faster.
 */
export interface Pen {
  kind: "coop" | "barn";
  animal: AnimalKind;
  count: number;
  /** Care scalar, 0–1. 1 = well-tended, 0 = neglected. */
  care: number;
  /** True if the farmer has fed/tended this pen today. */
  fedToday: boolean;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
}
