/**
 * Fishing action handler: fish, pickWeightedFish.
 *
 * Fish from the fishing isle. Requirements: the farmer holds a fishing rod,
 * stands ON a `fishing-isle` tile, and is adjacent (Chebyshev ≤ 1) to an
 * OCEAN tile (the shoreline) to cast into. The catch tilts on whether that
 * water is churning: casting next to a bubble spot uses the rarer
 * FISH_WEIGHTS_BUBBLE odds, otherwise calm-water FISH_WEIGHTS_CALM
 * (mostly minnows). On success it lands one of minnow/bass/salmon (1/3/5
 * gold), banked directly + tallied in inventory.fish. The rod has no
 * durability. The reward is awarded now (deterministic on the seed); a random
 * 5–30 s busy window on busyUntilTick keeps the angler occupied.
 */
import type { Rng } from "@engine/core";
import type { FishKind } from "../../../components";
import {
  FISH_KINDS,
  FISH_VALUE,
  FISH_MIN_TICKS,
  FISH_MAX_TICKS,
  FISH_WEIGHTS_CALM,
  FISH_WEIGHTS_BUBBLE,
} from "../../../components";
import { grantSkillXp, fishingRarityBonus } from "../../skills";
import { isFishingIsle, isWalkable } from "../../../world/regions";
import { applyFishingRarityBonus } from "../helpers";
import type { ActingFarmer } from "../types";

/** Draw a fish kind by [minnow,bass,salmon] weights. Deterministic via the
 *  forked fish rng; falls back to Math.random when rng-less (legacy tests). */
export function pickWeightedFish(
  weights: Record<FishKind, number>,
  fishRng: Rng | null,
): FishKind {
  const total = FISH_KINDS.reduce((s, k) => s + weights[k], 0);
  const r = (fishRng ? fishRng.nextFloat() : Math.random()) * total;
  let acc = 0;
  for (const k of FISH_KINDS) {
    acc += weights[k];
    if (r < acc) return k;
  }
  return FISH_KINDS[FISH_KINDS.length - 1]!;
}

export function handleFish(
  farmer: ActingFarmer,
  bubbleTiles: ReadonlySet<string>,
  tick: number,
  fishRng: Rng | null,
): void {
  const rod = (farmer.inventory.tools ?? []).find((t) => t.kind === "fishing-rod");
  if (!rod || !farmer.transform) return;
  // Must be standing on a fishing isle.
  if (!isFishingIsle(farmer.farmer?.currentRegion ?? null)) return;

  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  // Find an adjacent ocean tile (the shore the rod casts into). Prefer the
  // 4-neighbours; any non-walkable neighbour is open water.
  const NEIGHBOURS = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];
  let castX: number | null = null;
  let castY: number | null = null;
  let nearBubble = false;
  for (const { dx, dy } of NEIGHBOURS) {
    const ox = fx + dx;
    const oy = fy + dy;
    if (isWalkable(ox, oy)) continue; // not open water
    // First open-water neighbour becomes the cast target; if any adjacent
    // water tile is a bubble, the whole cast counts as a bubble cast.
    if (castX === null) { castX = ox; castY = oy; }
    if (bubbleTiles.has(`${ox},${oy}`)) nearBubble = true;
  }
  if (castX === null) return; // no open water to cast into

  // Weighted catch: rarer odds next to a bubble, calm odds otherwise.
  // brief 43 — fishing skill reallocates a fraction of the minnow weight toward
  // bass+salmon (a pure function of fishing XP), so a master angler lands rarer
  // fish more often. The pick itself stays on the forked seeded fish rng.
  const baseWeights = nearBubble ? FISH_WEIGHTS_BUBBLE : FISH_WEIGHTS_CALM;
  const weights = applyFishingRarityBonus(baseWeights, fishingRarityBonus(farmer.skills?.fishing ?? 0));
  const fish = pickWeightedFish(weights, fishRng);
  const busyTicks = fishRng
    ? fishRng.int(FISH_MIN_TICKS, FISH_MAX_TICKS + 1)
    : FISH_MIN_TICKS + Math.floor(Math.random() * (FISH_MAX_TICKS - FISH_MIN_TICKS + 1));

  if (!farmer.inventory.fish) farmer.inventory.fish = { minnow: 0, bass: 0, salmon: 0 };
  farmer.inventory.fish[fish] += 1;
  farmer.inventory.gold += FISH_VALUE[fish];
  // brief 43 — a cast earns fishing XP.
  grantSkillXp(farmer, "fishing", 1);

  if (farmer.farmer) farmer.farmer.busyUntilTick = tick + busyTicks;
}
