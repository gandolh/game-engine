import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeLayout, resetNodeIds } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import type { RendererLike } from "@engine/core/render";
import { createInventory } from "./inventory";
import type { Inventory, InventoryOptions } from "./inventory";
import { createUIHost } from "./ui-host";
import type { PlayerInventory, ItemSlotState } from "@farm/sim-core/snapshot";

/** A jsdom canvas + a no-op renderer/host stub; tracks swaps and cleans up each inventory's
 *  window listeners (mirrors hotbar.test.ts's fixture shape). */
const built: Inventory[] = [];
let swaps: Array<[number, number]>;
let ownerFlag: boolean;

// Minimal renderer stand-in — inventory.ts never calls it directly in these tests (no
// drawIcons/drawGhost pass here), but `createUIHost` requires a `RendererLike`.
function makeRenderer(): RendererLike {
  return {
    beginUI() {},
    pushUI() {},
    endUI() {},
    addAtlas() {},
  } as unknown as RendererLike;
}

function makeInventory(overrides: Partial<InventoryOptions> = {}): Inventory {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
  // `createUIHost` is the real host (matches how `panels.ts` wires the inventory) rather than a
  // hand-rolled fake, so the registered root's dispatcher/mirror plumbing is exercised too.
  const host = createUIHost(makeRenderer(), canvas);
  const inv = createInventory({
    canvas,
    host,
    swapSlots: (from, to) => swaps.push([from, to]),
    isOwner: () => ownerFlag,
    ...overrides,
  });
  built.push(inv);
  return inv;
}

function makeSlot(overrides: Partial<ItemSlotState> = {}): ItemSlotState {
  return {
    ref: { kind: "seed", id: "wheat" } as unknown as ItemSlotState["ref"],
    label: "Wheat Seed",
    glyph: "W",
    frame: "",
    text: "x5",
    available: true,
    actionable: true,
    ...overrides,
  };
}

function makeInv(slots: ItemSlotState[], overrides: Partial<PlayerInventory> = {}): PlayerInventory {
  return { slots, hotbarSize: 8, selected: 0, gold: 100, ...overrides };
}

/** First slot's root box (title's sibling grid's first row's first slot). */
function firstSlotRoot(inv: Inventory): ContainerNode {
  const root = inv.getRoot()!;
  // root children: [title, gridBox, hint] — gridBox's first child is the first row, whose
  // first child is the first slot.
  const gridBox = root.children[1] as ContainerNode;
  const firstRow = gridBox.children[0] as ContainerNode;
  return firstRow.children[0] as ContainerNode;
}

describe("createInventory", () => {
  beforeEach(() => {
    resetNodeIds();
    built.length = 0;
    swaps = [];
    ownerFlag = true;
  });
  afterEach(() => {
    for (const inv of built) inv.destroy();
  });

  it("first refresh (while open) reports changed and populates slot text", () => {
    const inv = makeInventory();
    inv.setOpen(true);
    const changed = inv.refresh(makeInv([makeSlot()]));
    expect(changed).toBe(true);

    const slotRoot = firstSlotRoot(inv);
    const [glyphLbl, captionLbl, countLbl] = slotRoot.children as [LabelNode, LabelNode, LabelNode];
    expect(glyphLbl.text).toBe("W");
    expect(captionLbl.text).toBe("Wheat Seed");
    expect(countLbl.text).toBe("x5");
  });

  describe("icon/label overlap (regression)", () => {
    // Regression: the slot's `glyph` label had no fixed `layout` size, so it measured as its own
    // one-line-tall empty text — but `drawIcons` paints a full `ICON_SIZE` (30px) sprite over the
    // glyph's rect. That 30px icon spilled straight down over the caption AND count labels
    // stacked right below it (the item's icon rendering "on top of / overriding" its own name —
    // the reported "Inventory items overlap their labels"). hotbar.ts's `buildSlot` already
    // reserves `{ width: ICON_SIZE, height: ICON_SIZE }` on its glyph node for the same reason;
    // `inventory.ts` was missing the same fix.

    it("a filled slot's glyph node reserves a full ICON_SIZE x ICON_SIZE box, not just one text line", () => {
      const inv = makeInventory();
      inv.setOpen(true);
      // "tool/hoe" resolves to a real atlas frame (same fixture crop as hotbar.test.ts), so the
      // icon-drawing path is exercised (glyph text cleared, iconFrame set).
      inv.refresh(makeInv([makeSlot({ frame: "tool/hoe", glyph: "H" })]));

      const slotRoot = firstSlotRoot(inv);
      computeLayout(slotRoot, 0, 0);
      const glyphLbl = slotRoot.children[0] as LabelNode;

      expect(glyphLbl.text).toBe("");
      expect(glyphLbl.rect.height).toBeGreaterThanOrEqual(30);
    });

    it("the icon's reserved area never extends into the caption/count rows below it", () => {
      const inv = makeInventory();
      inv.setOpen(true);
      inv.refresh(makeInv([makeSlot({ frame: "tool/hoe", glyph: "H" })]));

      const slotRoot = firstSlotRoot(inv);
      computeLayout(slotRoot, 0, 0);
      const [glyphLbl, captionLbl, countLbl] = slotRoot.children as [LabelNode, LabelNode, LabelNode];
      const iconBottom = glyphLbl.rect.y + 30; // ICON_SIZE, mirrors drawIcons' draw rect.

      expect(iconBottom).toBeLessThanOrEqual(captionLbl.rect.y);
      expect(iconBottom).toBeLessThanOrEqual(countLbl.rect.y);
    });

    it("a slot with no sprite frame still falls back to its ASCII glyph, unaffected by the fixed size", () => {
      const inv = makeInventory();
      inv.setOpen(true);
      inv.refresh(makeInv([makeSlot({ frame: "", glyph: "W" })]));

      const slotRoot = firstSlotRoot(inv);
      const glyphLbl = slotRoot.children[0] as LabelNode;
      expect(glyphLbl.text).toBe("W");
    });
  });

  it("grows/shrinks the slot pool to match the snapshot's slot count", () => {
    const inv = makeInventory();
    inv.setOpen(true);
    inv.refresh(makeInv([makeSlot(), makeSlot()]));
    const root = inv.getRoot()!;
    const gridBox = root.children[1] as ContainerNode;
    const total = gridBox.children.reduce((n, row) => n + row.children.length, 0);
    expect(total).toBe(2);
  });
});
