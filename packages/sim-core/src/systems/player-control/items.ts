// The unified item grid: layout sizing, the default layout, slot/inventory
// reconciliation, and resolving an ItemRef to display fields (label/icon/count).
//
// The grid is a player-owned COSMETIC layout over the aggregate Inventory /
// ResourceInventory — it decides WHERE each item shows, never HOW MANY. Drag-drop
// swaps two slots; counts always come from the inventory. None of this is read by
// AI/economy systems, so determinism is unaffected.

import type {
  Inventory,
  ResourceInventory,
  ItemRef,
  CropKind,
  FishKind,
  CropQualityCounts,
} from "../../components";
import { itemKey } from "../../components";

/** Bottom hotbar row width (number keys 1..HOTBAR_SIZE select these). */
export const HOTBAR_SIZE = 8;
/** Backpack rows revealed by the inventory panel, same width as the hotbar. */
export const BACKPACK_ROWS = 3;
/** Total grid slots: hotbar row + backpack rows. */
export const TOTAL_SLOTS = HOTBAR_SIZE * (1 + BACKPACK_ROWS);

/**
 * The starting layout: tools + the three classic seed types fill the hotbar row, matching the
 * pre-item-grid HOTBAR_SLOTS order (1 Can · 2 Hoe · 3 Axe · 4 Pickaxe · 5 Rod · 6 Radish · 7 Wheat · 8 Pumpkin).
 * Everything else (other seeds, harvested crops, fish, resources, products, fruit, golden beans)
 * is appended to the first empty backpack slot as it is acquired (see `syncItemSlots`).
 */
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

/** Sum a per-quality count bucket (normal+silver+gold). Absent → 0. */
function sumQuality(c: CropQualityCounts | undefined): number {
  return c ? c.normal + c.silver + c.gold : 0;
}

/** Every item the player currently holds (count > 0), plus the always-present tools, as ItemRefs. */
export function allHeldRefs(inv: Inventory, resources: ResourceInventory | undefined): ItemRef[] {
  const refs: ItemRef[] = [];
  // Tools are durable — always present so they keep their hotbar slots even at "x0".
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

/**
 * Reconcile a slot layout with current holdings: append any held item kind that has no slot yet
 * into the first empty slot. Never removes a slot (a depleted item stays as a dimmed "x0" entry,
 * matching the pre-item-grid hotbar), so the player's manual drag arrangement is preserved.
 * Mutates `slots` in place.
 */
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
    if (empty < 0) break; // grid full — drop overflow (rare; the grid is generous)
    slots[empty] = ref;
    present.add(k);
  }
}

/** Display fields for one resolved item. `text` is the count readout; empty for durable tools. */
export interface ResolvedItem {
  label: string;
  glyph: string;
  /** Atlas frame for the icon, or "" when no sprite exists (UI falls back to `glyph`). */
  frame: string;
  text: string;
  /** False dims the slot (out of stock / nothing to do). */
  available: boolean;
  /** True for tools/seeds — the hotbar can dispatch a field action from this slot. */
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

/** Resolve an ItemRef to its display fields against current holdings. */
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
      // Only shore fish have atlas sprites; coral specials fall back to the glyph.
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
