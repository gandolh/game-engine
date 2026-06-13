import type { FishKind } from "../../components";
import { TOOL_WORK_TICKS } from "../../components";

export function actionTicks(kind: string, tools: import("../../components").Tool[]): number {
  const physicalActions = new Set(["plant","water","till","chop-tree","mine-stone","harvest","refill-can"]);
  if (!physicalActions.has(kind)) return 0;
  let toolKind: import("../../components").ToolKind | null = null;
  if (kind === "till") toolKind = "hoe";
  else if (kind === "chop-tree") toolKind = "axe";
  else if (kind === "mine-stone") toolKind = "pickaxe";
  else toolKind = "hoe"; 
  const tierOrder: Record<string, number> = { wooden: 0, stone: 1, iron: 2 };
  const best = tools
    .filter(t => t.kind === toolKind && t.durability > 0)
    .sort((a, b) => (tierOrder[b.tier] ?? 0) - (tierOrder[a.tier] ?? 0))[0];
  const tier = (best?.tier ?? "wooden") as import("../../components").ToolTier;
  return TOOL_WORK_TICKS[tier];
}

export function applyFishingRarityBonus(
  weights: Record<FishKind, number>,
  bonus: number,
): Record<FishKind, number> {
  if (bonus <= 0) return weights;
  const moved = weights.minnow * bonus;
  return {
    ...weights,
    minnow: weights.minnow - moved,
    bass:   weights.bass + moved * 0.5,
    salmon: weights.salmon + moved * 0.5,
  };
}

export function applyCoralRarityBonus(
  weights: Record<FishKind, number>,
  bonus: number,
): Record<FishKind, number> {
  if (bonus <= 0) return weights;
  const moved = weights["coral-trout"] * bonus;
  return {
    ...weights,
    "coral-trout": weights["coral-trout"] - moved,
    lobster:       weights.lobster + moved,
  };
}
