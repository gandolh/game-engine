/** Fishing handler. Near-bubble cast uses FISH_WEIGHTS_BUBBLE (rarer odds); calm uses FISH_WEIGHTS_CALM. Reward is deterministic via forked fishRng. */
import type { Rng } from "@engine/core";
import type { FishKind } from "../../../components";
import {
  FISH_KINDS,
  FISH_VALUE,
  FISH_MIN_TICKS,
  FISH_MAX_TICKS,
  FISH_WEIGHTS_CALM,
  FISH_WEIGHTS_BUBBLE,
  zeroFish,
} from "../../../components";
import { grantSkillXp, fishingRarityBonus } from "../../skills";
import { isFishingIsle, isWalkable } from "../../../world/regions";
import { applyFishingRarityBonus } from "../helpers";
import type { ActingFarmer } from "../types";

/** Draw a fish kind by weights. Must use the forked fish rng (determinism). */
export function pickWeightedFish(
  weights: Record<FishKind, number>,
  fishRng: Rng,
): FishKind {
  const total = FISH_KINDS.reduce((s, k) => s + weights[k], 0);
  const r = fishRng.nextFloat() * total;
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
  fishRng: Rng,
): void {
  const rod = (farmer.inventory.tools ?? []).find((t) => t.kind === "fishing-rod");
  if (!rod || !farmer.transform) return;
  if (!isFishingIsle(farmer.farmer?.currentRegion ?? null)) return;

  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  // Any non-walkable 4-neighbour is open water to cast into.
  const NEIGHBOURS = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];
  let castX: number | null = null;
  let castY: number | null = null;
  let nearBubble = false;
  for (const { dx, dy } of NEIGHBOURS) {
    const ox = fx + dx;
    const oy = fy + dy;
    if (isWalkable(ox, oy)) continue;
    if (castX === null) { castX = ox; castY = oy; }
    if (bubbleTiles.has(`${ox},${oy}`)) nearBubble = true;
  }
  if (castX === null) return;

  // Fishing skill reallocates minnow weight toward bass+salmon (pure function of XP).
  const baseWeights = nearBubble ? FISH_WEIGHTS_BUBBLE : FISH_WEIGHTS_CALM;
  const weights = applyFishingRarityBonus(baseWeights, fishingRarityBonus(farmer.skills?.fishing ?? 0));
  const fish = pickWeightedFish(weights, fishRng);
  const busyTicks = fishRng.int(FISH_MIN_TICKS, FISH_MAX_TICKS + 1);

  if (!farmer.inventory.fish) farmer.inventory.fish = zeroFish();
  farmer.inventory.fish[fish] += 1;
  farmer.inventory.gold += FISH_VALUE[fish];
  grantSkillXp(farmer, "fishing", 1);

  if (farmer.farmer) farmer.farmer.busyUntilTick = tick + busyTicks;
}
