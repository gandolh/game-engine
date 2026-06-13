

import type {
  Inventory,
  ResourceInventory,
  ItemRef,
  CropKind,
  FishKind,
  CropQualityCounts,
} from "../../components";
import { itemKey } from "../../components";

export const HOTBAR_SIZE = 8;

export const BACKPACK_ROWS = 3;

export const TOTAL_SLOTS = HOTBAR_SIZE * (1 + BACKPACK_ROWS);

export function defaultItemSlots(): (ItemRef | null)[] {
  const slots: (ItemRef | null)[] = new Array(TOTAL_SLOTS).fill(null);
  slots[0] = { kind: "tool", tool: "can" };
  slots[1] = { kind: "tool", tool: "hoe" };
  slots[2] = { kind: "tool", tool: "axe" };
  slots[3] = { kind: "tool", tool: "pickaxe" };
  slots[4] = { kind: "tool", tool: "fishing-rod" };
  slots[5] = { kind: "seed", crop: "radish" };
  slots[6] = { kind: "seed", crop: "wheat" };
  slots[7] = { kind: "seed", crop: "pumpkin" };
  return slots;
}

const CROP_KINDS: readonly CropKind[] = [
  "radish", "wheat", "carrot", "tomato", "corn", "pumpkin", "grape", "winter-squash",
];
const FISH_KINDS_ALL: readonly FishKind[] = [
  "minnow", "bass", "salmon", "coral-trout", "lobster",
];
const RESOURCE_KINDS = ["wood", "stone", "ironOre", "geodes"] as const;

function sumQuality(c: CropQualityCounts | undefined): number {
  return c ? c.normal + c.silver + c.gold : 0;
}

export function allHeldRefs(inv: Inventory, resources: ResourceInventory | undefined): ItemRef[] {
  const refs: ItemRef[] = [];

  refs.push({ kind: "tool", tool: "can" });
  for (const t of inv.tools ?? []) {
    if (t.kind === "hoe" || t.kind === "axe" || t.kind === "pickaxe" || t.kind === "fishing-rod") {
      refs.push({ kind: "tool", tool: t.kind });
    }
  }
  for (const crop of CROP_KINDS) {
    if ((inv.seeds[crop] ?? 0) > 0) refs.push({ kind: "seed", crop });
    if ((inv.crops[crop] ?? 0) > 0) refs.push({ kind: "crop", crop });
  }
  for (const fish of FISH_KINDS_ALL) {
    if ((inv.fish?.[fish] ?? 0) > 0) refs.push({ kind: "fish", fish });
  }
  if (resources) {
    for (const resource of RESOURCE_KINDS) {
      if ((resources[resource] ?? 0) > 0) refs.push({ kind: "resource", resource });
    }
  }
  for (const product of ["egg", "milk", "wool"] as const) {
    if (sumQuality(inv.products?.[product]) > 0) refs.push({ kind: "product", product });
  }
  for (const fruit of ["apple", "cherry"] as const) {
    if (sumQuality(inv.fruit?.[fruit]) > 0) refs.push({ kind: "fruit", fruit });
  }
  if ((inv.goldenBeans ?? 0) > 0) refs.push({ kind: "goldenBeans" });
  return refs;
}

export function syncItemSlots(
  slots: (ItemRef | null)[],
  inv: Inventory,
  resources: ResourceInventory | undefined,
): void {
  const present = new Set<string>();
  for (const s of slots) if (s !== null) present.add(itemKey(s));
  for (const ref of allHeldRefs(inv, resources)) {
    const k = itemKey(ref);
    if (present.has(k)) continue;
    const empty = slots.indexOf(null);
    if (empty < 0) break; 
    slots[empty] = ref;
    present.add(k);
  }
}

export interface ResolvedItem {
  label: string;
  glyph: string;

  frame: string;
  text: string;

  available: boolean;

  actionable: boolean;
}

function titleCase(kind: string): string {
  return kind
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const TOOL_DISPLAY: Record<string, { label: string; glyph: string; frame: string }> = {
  can:           { label: "Can",     glyph: "🪣", frame: "tool/can" },
  hoe:           { label: "Hoe",     glyph: "⛏", frame: "tool/hoe" },
  axe:           { label: "Axe",     glyph: "🪓", frame: "tool/axe" },
  pickaxe:       { label: "Pickaxe", glyph: "⚒", frame: "tool/pickaxe" },
  "fishing-rod": { label: "Rod",     glyph: "🎣", frame: "tool/fishing-rod" },
};

const FISH_GLYPH = "🐟";
const RESOURCE_GLYPH: Record<string, string> = {
  wood: "🪵", stone: "🪨", ironOre: "⚙", geodes: "💎",
};
const PRODUCT_GLYPH: Record<string, string> = { egg: "🥚", milk: "🥛", wool: "🧶" };
const FRUIT_GLYPH: Record<string, string> = { apple: "🍎", cherry: "🍒" };

export function resolveItem(
  ref: ItemRef,
  inv: Inventory,
  resources: ResourceInventory | undefined,
): ResolvedItem {
  switch (ref.kind) {
    case "tool": {
      const d = TOOL_DISPLAY[ref.tool]!;
      if (ref.tool === "can") {
        const can = inv.wateringCan;
        const text = can ? `${can.charges}/${can.maxCharges}` : "0/0";
        return { ...d, text, available: (can?.charges ?? 0) > 0, actionable: true };
      }
      return { ...d, text: "", available: true, actionable: true };
    }
    case "seed": {
      const n = inv.seeds[ref.crop] ?? 0;
      return {
        label: titleCase(ref.crop), glyph: "🌱", frame: `crop/${ref.crop}/seed`,
        text: `x${n}`, available: n > 0, actionable: true,
      };
    }
    case "crop": {
      const n = inv.crops[ref.crop] ?? 0;
      return {
        label: titleCase(ref.crop), glyph: "🥬", frame: `crop/${ref.crop}/mature`,
        text: `x${n}`, available: n > 0, actionable: false,
      };
    }
    case "fish": {
      const n = inv.fish?.[ref.fish] ?? 0;

      const hasFrame = ref.fish === "minnow" || ref.fish === "bass" || ref.fish === "salmon";
      return {
        label: titleCase(ref.fish), glyph: FISH_GLYPH, frame: hasFrame ? `fish/${ref.fish}` : "",
        text: `x${n}`, available: n > 0, actionable: false,
      };
    }
    case "resource": {
      const n = resources?.[ref.resource] ?? 0;
      return {
        label: titleCase(ref.resource), glyph: RESOURCE_GLYPH[ref.resource] ?? "📦", frame: "",
        text: `x${n}`, available: n > 0, actionable: false,
      };
    }
    case "product": {
      const n = sumQuality(inv.products?.[ref.product]);
      return {
        label: titleCase(ref.product), glyph: PRODUCT_GLYPH[ref.product] ?? "📦",
        frame: `product/${ref.product}`, text: `x${n}`, available: n > 0, actionable: false,
      };
    }
    case "fruit": {
      const n = sumQuality(inv.fruit?.[ref.fruit]);
      return {
        label: titleCase(ref.fruit), glyph: FRUIT_GLYPH[ref.fruit] ?? "📦",
        frame: `fruit/${ref.fruit}`, text: `x${n}`, available: n > 0, actionable: false,
      };
    }
    case "goldenBeans": {
      const n = inv.goldenBeans ?? 0;
      return {
        label: "Golden Beans", glyph: "✨", frame: "",
        text: `x${n}`, available: n > 0, actionable: false,
      };
    }
  }
}
