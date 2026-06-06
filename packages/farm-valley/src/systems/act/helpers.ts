import type { FishKind } from "../../components";
import { TOOL_WORK_TICKS } from "../../components";

/**
 * Physical-action time cost in ticks (at 20 Hz).
 * Wooden=60t(3s), stone=40t(2s), iron=20t(1s) per the brief.
 * Social / travel actions are instant (0).
 */
export function actionTicks(kind: string, tools: import("../../components").Tool[]): number {
  const physicalActions = new Set(["plant","water","till","chop-tree","mine-stone","harvest","refill-can"]);
  if (!physicalActions.has(kind)) return 0;
  // Pick the best relevant tool for the action.
  let toolKind: import("../../components").ToolKind | null = null;
  if (kind === "till") toolKind = "hoe";
  else if (kind === "chop-tree") toolKind = "axe";
  else if (kind === "mine-stone") toolKind = "pickaxe";
  else toolKind = "hoe"; // plant/water/harvest — hoe is the reference
  const tierOrder: Record<string, number> = { wooden: 0, stone: 1, iron: 2 };
  const best = tools
    .filter(t => t.kind === toolKind && t.durability > 0)
    .sort((a, b) => (tierOrder[b.tier] ?? 0) - (tierOrder[a.tier] ?? 0))[0];
  const tier = (best?.tier ?? "wooden") as import("../../components").ToolTier;
  return TOOL_WORK_TICKS[tier];
}

/**
 * brief 43 — reallocate `bonus` fraction of the minnow weight toward the rarer
 * bass+salmon (split 50/50), leaving total weight unchanged. Pure: depends only
 * on the input weights + bonus, so it doesn't touch the RNG. At bonus=0 the
 * weights are returned unshifted (so unskilled fishing is byte-identical to the
 * pre-43 behavior).
 */
export function applyFishingRarityBonus(
  weights: Record<FishKind, number>,
  bonus: number,
): Record<FishKind, number> {
  if (bonus <= 0) return weights;
  const moved = weights.minnow * bonus;
  return {
    minnow: weights.minnow - moved,
    bass:   weights.bass + moved * 0.5,
    salmon: weights.salmon + moved * 0.5,
  };
}
