/**
 * Settlement tier system for Citadel Phase 5.
 *
 * Evaluates the current tier each day based on population, building count,
 * and defensive strength. Fires a promotion event when the tier advances.
 *
 * Tier ladder (ascending):
 *   Hamlet        — starting tier (always attainable)
 *   Village       — pop ≥ 8  OR buildings ≥ 8
 *   Town          — pop ≥ 20 OR buildings ≥ 15
 *   Citadel       — pop ≥ 40 OR (buildings ≥ 25 AND defense ≥ 20)
 *   Fortress-City — pop ≥ 60 OR (buildings ≥ 40 AND defense ≥ 50)
 *
 * Gating the catalog: some buildings are locked behind a minimum tier.
 * The tier-lock is checked in the placeBuilding handler via `tierLockFor`.
 */
import type { System, SimContext } from "@engine/core";
import type { SimState } from "../sim-state";
import { pushEvent } from "../sim-state";

export type SettlementTier =
  | "Hamlet"
  | "Village"
  | "Town"
  | "Citadel"
  | "Fortress-City";

/** Ordered from lowest to highest. */
export const TIER_ORDER: readonly SettlementTier[] = [
  "Hamlet",
  "Village",
  "Town",
  "Citadel",
  "Fortress-City",
];

/** Minimum tier required to place a building type.  Missing entry = no lock. */
export const TIER_LOCK: Readonly<Record<string, SettlementTier>> = {
  // Siege / fortification buildings unlock at Town+.
  keep:     "Town",
  garrison: "Town",
  tower:    "Village",
  wall:     "Village",
  gate:     "Village",
  // Refining chains unlock at Village+.
  sawmill:  "Village",
  smith:    "Village",
  quarry:   "Village",
  mine:     "Village",
};

/**
 * Tier unlock condition: a tier is reached if EITHER
 *   (a) population >= minPop, OR
 *   (b) buildingCount >= minBuildings AND defensiveStrength >= minDefenseForBuildings.
 *
 * The "pop-only" path allows a thriving metropolis to reach Citadel status
 * without necessarily being militarized; the "buildings+defense" path reflects
 * a fortified but less populated stronghold.
 */
export interface TierGateThreshold {
  /** Pop alone unlocks this tier. */
  readonly minPop: number;
  /** Buildings + defense together unlock this tier. */
  readonly minBuildings: number;
  /** Minimum defense required when using the buildings path. */
  readonly minDefenseForBuildings: number;
}

/** Threshold to REACH each tier. "Hamlet" has no threshold. */
export const TIER_THRESHOLDS: Readonly<Partial<Record<SettlementTier, TierGateThreshold>>> = {
  Village:         { minPop: 8,  minBuildings: 8,  minDefenseForBuildings: 0  },
  Town:            { minPop: 20, minBuildings: 15, minDefenseForBuildings: 0  },
  Citadel:         { minPop: 40, minBuildings: 25, minDefenseForBuildings: 20 },
  "Fortress-City": { minPop: 60, minBuildings: 40, minDefenseForBuildings: 50 },
};

/**
 * Compute the tier that should be active given current sim state.
 * Returns the HIGHEST tier whose threshold is satisfied.
 *
 * Unlock: population >= minPop  OR  (buildings >= minBuildings AND defense >= minDefenseForBuildings).
 */
export function computeTier(
  population: number,
  buildingCount: number,
  defenseStrength: number,
): SettlementTier {
  let tier: SettlementTier = "Hamlet";
  for (const candidate of TIER_ORDER) {
    const threshold = TIER_THRESHOLDS[candidate];
    if (threshold === undefined) continue; // Hamlet — always satisfied
    const popPath      = population    >= threshold.minPop;
    const buildingPath = buildingCount >= threshold.minBuildings
                      && defenseStrength >= threshold.minDefenseForBuildings;
    if (popPath || buildingPath) tier = candidate;
  }
  return tier;
}

/** Returns true if `candidate` is at least as high as `minimum`. */
export function tierAtLeast(candidate: SettlementTier, minimum: SettlementTier): boolean {
  return TIER_ORDER.indexOf(candidate) >= TIER_ORDER.indexOf(minimum);
}

/**
 * TierSystem: re-evaluates the settlement tier once per day (at the first
 * tick of each day) and fires a pushEvent on promotion.
 */
export class TierSystem implements System {
  readonly name = "TierSystem";
  private lastCheckedDay = -1;

  constructor(private readonly state: SimState) {}

  run(ctx: SimContext): void {
    // Only evaluate once per day (at tick 0 of each day).
    const dayTick = ctx.tick % this.state.ticksPerDay;
    if (dayTick !== 0) return;
    const day = this.state.day;
    if (day === this.lastCheckedDay) return;
    this.lastCheckedDay = day;

    const buildingCount = this.state.buildingWorld.query("building").entities.length;
    const newTier = computeTier(
      this.state.population,
      buildingCount,
      this.state.defensiveStrength,
    );

    if (newTier !== this.state.tier) {
      const old = this.state.tier;
      this.state.tier = newTier;
      pushEvent(
        this.state,
        `Day ${day}: Your settlement has risen from ${old} to ${newTier}! Hail, ${newTier}!`,
      );
    }
  }
}
