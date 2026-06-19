import type { GameEntity } from "../../components";
import type { CropKind } from "../../components";
import { MAX_LOOT_UNITS } from "./constants";

export function lootGoods(victor: GameEntity, victim: GameEntity): number {
  if (!victor.inventory || !victim.inventory) return 0;
  let taken = 0;

  const moveFrom = (
    src: Record<string, number>,
    dst: Record<string, number>,
  ): void => {
    for (const key of Object.keys(src)) {
      while (taken < MAX_LOOT_UNITS && (src[key] ?? 0) > 0) {
        src[key] = (src[key] ?? 0) - 1;
        dst[key] = (dst[key] ?? 0) + 1;
        taken++;
      }
      if (taken >= MAX_LOOT_UNITS) return;
    }
  };

  moveFrom(
    victim.inventory.crops as Record<CropKind, number>,
    victor.inventory.crops as Record<CropKind, number>,
  );
  if (taken < MAX_LOOT_UNITS) {
    moveFrom(
      victim.inventory.seeds as Record<CropKind, number>,
      victor.inventory.seeds as Record<CropKind, number>,
    );
  }
  return taken;
}
