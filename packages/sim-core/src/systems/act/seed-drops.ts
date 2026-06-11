// Random-seed drops shared by bush foraging (handleGatherBush) and the
// occasional tree-chop bonus (handleChopTree). Rarity-weighted: common spring
// crops fall often, premium crops (grape/pumpkin) rarely — mirrors the
// FISH_WEIGHTS pattern. Every draw MUST come from a forked Rng so the sim stays
// deterministic (never Math.random()).

import type { Rng } from "@engine/core";
import type { CropKind } from "../../components";

/**
 * Fixed draw order — iteration order is load-bearing for the weighted pick, so
 * this is an explicit ordered list, not `Object.keys`.
 */
const SEED_DROP_ORDER: readonly CropKind[] = [
  "radish", "wheat", "carrot", "tomato", "corn", "winter-squash", "pumpkin", "grape",
];

/** Drop weights — roughly inverse to crop sell value (radish cheapest, grape priciest). Sum = 100. */
export const SEED_WEIGHTS: Record<CropKind, number> = {
  radish:          30,
  wheat:           22,
  carrot:          18,
  tomato:          12,
  corn:            8,
  "winter-squash": 6,
  pumpkin:         3,
  grape:           1,
};

/** Chance that chopping a tree also drops one random seed (on top of the wood). */
export const TREE_SEED_CHANCE = 0.2;

/** Draw a seed kind by SEED_WEIGHTS. Must use a forked rng (determinism). */
export function pickWeightedSeed(rng: Rng): CropKind {
  const total = SEED_DROP_ORDER.reduce((s, k) => s + SEED_WEIGHTS[k], 0);
  const r = rng.nextFloat() * total;
  let acc = 0;
  for (const k of SEED_DROP_ORDER) {
    acc += SEED_WEIGHTS[k];
    if (r < acc) return k;
  }
  return SEED_DROP_ORDER[SEED_DROP_ORDER.length - 1]!;
}
