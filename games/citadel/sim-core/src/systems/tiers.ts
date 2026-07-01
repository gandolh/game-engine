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
 * Roads, walls, and gates are excluded from the building count: roads are
 * infrastructure and walls/gates are a fortification line (they raise defense,
 * not settlement size), so neither pre-laid roads nor wall-spam can inflate the
 * settlement tier before real structures and settlers arrive.
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
 * The tier a player's build/upgrade unlocks gate on: the highest tier they
 * have reached. `peakTier` is maintained ≥ `tier` by {@link TierSystem}, so in
 * the real sim this is just `peakTier`; taking the max is defensive (and keeps
 * a demotion from re-locking already-unlocked buildings — audit 38 P2#11).
 */
export function unlockTier(p: { tier: SettlementTier; peakTier: SettlementTier }): SettlementTier {
  return TIER_ORDER.indexOf(p.peakTier) >= TIER_ORDER.indexOf(p.tier) ? p.peakTier : p.tier;
}

/**
 * Whether a building type counts as a settlement STRUCTURE for tier advancement.
 * Roads are infrastructure; walls/gates are a fortification line (they raise
 * defensiveStrength, not settlement size). Excluding them stops pre-laid roads
 * or wall-spam from climbing the tier ladder with no real settlement (audit 38
 * P2#10).
 */
export function countsTowardTier(buildingType: string): boolean {
  const prod = getProductionDef(buildingType);
  return prod?.isRoad !== true && prod?.isWall !== true && prod?.isGate !== true;
}

/**
 * Count the settlement STRUCTURES a player owns — the same "non-road building
 * count" the tier ladder uses (roads/walls/gates excluded via
 * {@link countsTowardTier}). Shared so the cozy-pivot threat-defer gate
 * (fire/disease/raid) measures "town has grown past its seeded core" with the
 * exact same yardstick the tier system uses (audit: Chunk 2 cold-open defer).
 */
export function countNonRoadBuildings(state: SimState, playerId: number): number {
  let count = 0;
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.building.ownerId !== playerId) continue;
    if (countsTowardTier(entity.building.type)) count++;
  }
  return count;
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

    // Citadel 28: tier is per-player. Evaluate each player's tier from the
    // buildings THEY own (roads excluded — infrastructure, not settlement size).
    for (const p of this.state.players) {
      // Count only settlement STRUCTURES toward the tier. Roads are
      // infrastructure; walls/gates are a fortification line (they contribute
      // to defensiveStrength, not to settlement size) — counting them let
      // wall-spam alone climb to Town tier (audit 38 P2#10).
      const settlementBuildingCount = countNonRoadBuildings(this.state, p.id);
      const newTier = computeTier(p.population, settlementBuildingCount, p.defensiveStrength);

      if (newTier !== p.tier) {
        const old = p.tier;
        const rose = TIER_ORDER.indexOf(newTier) > TIER_ORDER.indexOf(old);
        p.tier = newTier;
        // Direction-aware message — a demotion (pop lost to disease/starvation)
        // must not say "risen" (audit 38 P2#11).
        // High-water mark only ever climbs — a later demotion must not re-lock
        // building types the player already unlocked.
        if (TIER_ORDER.indexOf(newTier) > TIER_ORDER.indexOf(p.peakTier)) p.peakTier = newTier;
        pushEvent(
          this.state,
          rose
            ? `Day ${day}: Your settlement has risen from ${old} to ${newTier}! Hail, ${newTier}!`
            : `Day ${day}: Your settlement has fallen from ${old} to ${newTier}.`,
        );
      }
    }
  }
}
