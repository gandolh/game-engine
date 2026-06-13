import type { CropKind } from "./crops";
import type { FishKind } from "./fish";
import type { ProductKind } from "./livestock";
import type { FruitKind } from "./orchard";

export type HotbarToolKind = "can" | "hoe" | "axe" | "pickaxe" | "fishing-rod";

export type ItemRef =
  | { kind: "tool"; tool: HotbarToolKind }
  | { kind: "seed"; crop: CropKind }
  | { kind: "crop"; crop: CropKind }
  | { kind: "fish"; fish: FishKind }
  | { kind: "resource"; resource: "wood" | "stone" | "ironOre" | "geodes" }
  | { kind: "product"; product: ProductKind }
  | { kind: "fruit"; fruit: FruitKind }
  | { kind: "goldenBeans" };

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
