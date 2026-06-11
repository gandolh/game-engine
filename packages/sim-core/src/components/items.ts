import type { CropKind } from "./crops";
import type { FishKind } from "./fish";
import type { ProductKind } from "./livestock";
import type { FruitKind } from "./orchard";

/** Tools that can occupy a hotbar slot. The watering can is "can" even though it
 *  lives in `inventory.wateringCan` rather than `inventory.tools`. */
export type HotbarToolKind = "can" | "hoe" | "axe" | "pickaxe" | "fishing-rod";

/**
 * A reference to one item identity that can live in a unified item-grid slot.
 * It identifies WHAT is in a slot; the displayed COUNT is always derived from the
 * aggregate Inventory / ResourceInventory (the slot layout is a player-owned view
 * over those counts, never a second source of truth). Structured-clone-friendly.
 */
export type ItemRef =
  | { kind: "tool"; tool: HotbarToolKind }
  | { kind: "seed"; crop: CropKind }
  | { kind: "crop"; crop: CropKind }
  | { kind: "fish"; fish: FishKind }
  | { kind: "resource"; resource: "wood" | "stone" | "ironOre" | "geodes" }
  | { kind: "product"; product: ProductKind }
  | { kind: "fruit"; fruit: FruitKind }
  | { kind: "goldenBeans" };

/** Stable identity string for an ItemRef — used to dedupe a kind across slots. */
export function itemKey(ref: ItemRef): string {
  switch (ref.kind) {
    case "tool":     return `tool:${ref.tool}`;
    case "seed":     return `seed:${ref.crop}`;
    case "crop":     return `crop:${ref.crop}`;
    case "fish":     return `fish:${ref.fish}`;
    case "resource": return `resource:${ref.resource}`;
    case "product":  return `product:${ref.product}`;
    case "fruit":    return `fruit:${ref.fruit}`;
    case "goldenBeans": return "goldenBeans";
  }
}
