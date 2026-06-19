/**
 * Settlement tier system for Citadel Phase 5.
 *
 * Evaluates the current tier each day based on population, building count
 * (roads excluded), and defensive strength. Fires a promotion event when
 * the tier advances.
 *
 * Tier ladder (ascending):
 *   Hamlet        — starting tier (always attainable)
 *   Village       — pop ≥ 8  OR (non-road buildings ≥ 8 AND pop ≥ 5)
 *   Town          — pop ≥ 20 OR (non-road buildings ≥ 15 AND pop ≥ 10)
 *   Citadel       — pop ≥ 40 OR (non-road buildings ≥ 25 AND defense ≥ 20 AND pop ≥ 20)
 *   Fortress-City — pop ≥ 60 OR (non-road buildings ≥ 40 AND defense ≥ 50 AND pop ≥ 35)
 *
 * Roads are excluded from the building count so that pre-laid road networks do
 * not artificially inflate the settlement tier before any settlers arrive.
 *
 * Population is always required alongside the buildings path so that an
 * empty-but-pre-built settlement cannot skip tiers before the first settler
 * arrives. This ensures the Hamlet → Village → Town → … progression is
 * climbed as the settlement actually grows, not front-loaded on construction.
 *
 * Gating the catalog: some buildings are locked behind a minimum tier.
 * The tier-lock is checked in the placeBuilding handler via `tierLockFor`.
 */
import type { System, SimContext } from "@engine/core";
import type { SimState } from "../sim-state";
import { pushEvent } from "../sim-state";
import { getProductionDef } from "../entities/building";

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
 *   (b) nonRoadBuildingCount >= minBuildings
 *       AND defensiveStrength >= minDefenseForBuildings
 *       AND population >= minPopForBuildings.
 *
 * The "pop-only" path allows a thriving metropolis to reach Citadel status
 * without necessarily being militarized; the "buildings+defense" path reflects
 * a fortified stronghold — but still requires a minimum living population so
 * an empty shell city cannot skip the progression ladder.
 *
 * Roads are excluded from the building count (they are infrastructure, not
 * settlement structures) so pre-laid road networks do not inflate the tier.
 */
export interface TierGateThreshold {
  /** Pop alone unlocks this tier. */
  readonly minPop: number;
  /** Non-road buildings required when using the buildings path. */
  readonly minBuildings: number;
  /** Minimum defense required when using the buildings path. */
  readonly minDefenseForBuildings: number;
  /**
   * Minimum population required EVEN when using the buildings path.
   * Prevents an empty-but-pre-built settlement from jumping tiers
   * before any settlers arrive.
   */
  readonly minPopForBuildings: number;
}

/** Threshold to REACH each tier. "Hamlet" has no threshold. */
export const TIER_THRESHOLDS: Readonly<Partial<Record<SettlementTier, TierGateThreshold>>> = {
  Village:         { minPop: 8,  minBuildings: 8,  minDefenseForBuildings: 0,  minPopForBuildings: 5  },
  Town:            { minPop: 20, minBuildings: 15, minDefenseForBuildings: 0,  minPopForBuildings: 10 },
  Citadel:         { minPop: 40, minBuildings: 25, minDefenseForBuildings: 20, minPopForBuildings: 20 },
  "Fortress-City": { minPop: 60, minBuildings: 40, minDefenseForBuildings: 50, minPopForBuildings: 35 },
};

/**
 * Compute the tier that should be active given current sim state.
 * Returns the HIGHEST tier whose threshold is satisfied.
 *
 * `nonRoadBuildingCount` must exclude road tiles — pass the count of placed
 * buildings whose production type is NOT isRoad=true.
 *
 * Unlock: population >= minPop
 *   OR  (nonRoadBuildings >= minBuildings
 *        AND defense >= minDefenseForBuildings
 *        AND population >= minPopForBuildings).
 */
export function computeTier(
  population: number,
  nonRoadBuildingCount: number,
  defenseStrength: number,
): SettlementTier {
  let tier: SettlementTier = "Hamlet";
  for (const candidate of TIER_ORDER) {
    const threshold = TIER_THRESHOLDS[candidate];
    if (threshold === undefined) continue; // Hamlet — always satisfied
    const popPath      = population >= threshold.minPop;
    const buildingPath = nonRoadBuildingCount >= threshold.minBuildings
                      && defenseStrength >= threshold.minDefenseForBuildings
                      && population     >= threshold.minPopForBuildings;
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

    // Count only non-road buildings: roads are infrastructure and must not
    // inflate the tier before settlers arrive.
    let nonRoadBuildingCount = 0;
    for (const entity of this.state.buildingWorld.query("building")) {
      const prod = getProductionDef(entity.building.type);
      if (prod?.isRoad !== true) nonRoadBuildingCount++;
    }
    const newTier = computeTier(
      this.state.population,
      nonRoadBuildingCount,
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
