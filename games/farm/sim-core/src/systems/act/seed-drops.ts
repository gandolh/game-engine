

import type { Rng } from "@engine/core";
import type { CropKind } from "../../components";

const SEED_DROP_ORDER: readonly CropKind[] = [
  "radish", "wheat", "carrot", "tomato", "corn", "winter-squash", "pumpkin", "grape",
];

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

export const TREE_SEED_CHANCE = 0.2;

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
