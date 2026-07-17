import type { GameEntity, TileFeature } from "../../components";
import { recordReason } from "../../components";
import type { NonFarmFocus } from "../skill-valuation";
import { deliberateFishing } from "./fishing";
import { deliberateCoralFishing } from "./coral";
import { deliberateSeasonalForage } from "./gather";

/**
 * Skill-gated non-farm driver (2026-07-16 brief: skill-gated intentions).
 *
 * The single entry every personality routes its non-farm leaning through, so the
 * cadence is decided by ONE shared, skill-aware valuation
 * ([../skill-valuation.ts](../skill-valuation.ts)) instead of per-personality
 * magic literals. `focus.commit` (0..1, rising with the farmer's tier in the
 * line) maps to how OFTEN a farmer takes a non-farm excursion.
 *
 * Division of labour with the personality's gather call:
 * - **mining** and the local half of **foraging** are worked by the focus-aware
 *   `deliberateResourceGather` (preferKind + boosted cap); that helper already
 *   front-priority-walks a farmer to their owned vein, so nothing extra is
 *   queued here for mining.
 * - **fishing** and the seasonal gold-zone half of **foraging** are EXCURSIONS
 *   that must out-rank farm chores to leave the farm at all, so they are queued
 *   here at front (negative) priority on a commit-scaled cadence — episodic full
 *   commitment (go, work, come back), never an every-day pull off the farm.
 *
 * `focus === null` is a no-op — a farmer with no worthwhile lean just farms.
 */

const BASE_FISH_PERIOD = 9;
const MIN_FISH_PERIOD = 2;
const BASE_FORAGE_PERIOD = 6;
const MIN_FORAGE_PERIOD = 2;

/** Front-of-queue priority — an excursion travel only fires when it is the
 *  first intent (TravelSystem walks the queue front), so a committed trip must
 *  out-rank the farm chores it is stealing the day from. */
const FRONT = -2;

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

export function deliberateSkilledNonFarm(
  farmer: GameEntity,
  focus: NonFarmFocus | null,
  _features: readonly TileFeature[],
  _basePriority: number,
): void {
  if (!farmer.intentions || !focus) return;
  const { line, commit } = focus;
  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;

  if (line === "fishing") {
    const period = clampInt(BASE_FISH_PERIOD - commit * (BASE_FISH_PERIOD - MIN_FISH_PERIOD), MIN_FISH_PERIOD, BASE_FISH_PERIOD);
    const casts = 1 + Math.round(commit * 2);
    const apFloor = Math.round(50 - commit * 50);
    // Coral is the chase-worthy payoff line; shore fishing is the cheap entry
    // that builds the SAME fishing tier (so it feeds coral's rarity bonus).
    deliberateCoralFishing(farmer, period, casts, FRONT, apFloor);
    deliberateFishing(farmer, period, casts, FRONT + 1);
    recordReason(farmer, `skill-lean fishing (commit ${commit.toFixed(2)}, period ${period})`);
  } else if (line === "foraging") {
    // Local forest bushes are worked by the boosted gather; the seasonal gold
    // zone is an excursion — cadence-gated so its direct gold supplements rather
    // than dominates the wealth ordering.
    const period = clampInt(BASE_FORAGE_PERIOD - commit * (BASE_FORAGE_PERIOD - MIN_FORAGE_PERIOD), MIN_FORAGE_PERIOD, BASE_FORAGE_PERIOD);
    if (day % period === 0) {
      deliberateSeasonalForage(farmer, FRONT);
      recordReason(farmer, `skill-lean foraging (commit ${commit.toFixed(2)}, period ${period})`);
    }
  }
  // mining: handled entirely by the focus-aware gather (preferKind "stone").
}
