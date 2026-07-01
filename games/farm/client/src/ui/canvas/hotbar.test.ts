import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetNodeIds } from "@engine/ui";
import type { UINode, LabelNode } from "@engine/ui";
import { EDG } from "@engine/core";
import { createHotbar } from "./hotbar";
import type { Hotbar, HotbarActions } from "./hotbar";
import type { PlayerHotbar, HotbarSlotState } from "@farm/sim-core/snapshot";

/** A jsdom canvas + stub actions; tracks swaps and cleans up each hotbar's window listeners. */
const built: Hotbar[] = [];
let lastCanvas: HTMLCanvasElement;
let swaps: Array<[number, number]>;
let ownerFlag: boolean;

function makeHotbar_(overrides: Partial<HotbarActions> = {}): Hotbar {
  lastCanvas = document.createElement("canvas");
  lastCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const h = createHotbar({
    canvas: lastCanvas,
    swapSlots: (from, to) => swaps.push([from, to]),
    isOwner: () => ownerFlag,
    ...overrides,
  });
  built.push(h);
  return h;
}
// Alias so the existing `createHotbar()` call sites read unchanged.
const createHotbarT = () => makeHotbar_();

/** Collect every label's text in the tree, in pre-order. */
function labelTexts(node: UINode, out: string[] = []): string[] {
  if (node.kind === "label") out.push(node.text);
  for (const child of node.children) labelTexts(child, out);
  return out;
}

function makeSlot(overrides: Partial<HotbarSlotState> = {}): HotbarSlotState {
  return {
    label: "Hoe",
    glyph: "H",
    frame: "",
    text: "",
    available: true,
    ...overrides,
  };
}

function makeHotbar(slots: HotbarSlotState[], selected = 0): PlayerHotbar {
  return { slots, selected };
}

describe("createHotbar", () => {
  beforeEach(() => {
    resetNodeIds();
    built.length = 0;
    swaps = [];
    ownerFlag = true;
  });
  afterEach(() => {
    for (const h of built) h.destroy();
  });

  it("builds a tree with 8 slots regardless of input size", () => {
    const hotbar = createHotbarT();
    // 8 slot roots directly under the panel root.
    expect(hotbar.root.children.length).toBe(8);
  });

  it("first refresh reports changed and sets slot caption/count", () => {
    const hotbar = createHotbarT();
    const state = makeHotbar([
      makeSlot({ label: "Hoe", glyph: "H", text: "" }),
      makeSlot({ label: "Seeds", glyph: "S", text: "12" }),
    ]);
    const changed = hotbar.refresh(state);
    expect(changed).toBe(true);

    const texts = labelTexts(hotbar.root);
    expect(texts).toContain("Hoe");
    expect(texts).toContain("Seeds");
    expect(texts).toContain("12");
  });

  it("badge numbers 1..8 are present regardless of hotbar content", () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot()]));
    const texts = labelTexts(hotbar.root);
    for (let i = 1; i <= 8; i++) expect(texts).toContain(`${i}`);
  });

  it("refresh(null) hides all slots (opacity 0) and reports changed once", () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot()]));
    const changed = hotbar.refresh(null);
    expect(changed).toBe(true);
    for (const slotRoot of hotbar.root.children) {
      expect(slotRoot.opacity).toBe(0);
    }
  });

  it("selected slot is tracked (drawIcons draws a gold border for it) without affecting layout", () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot(), makeSlot()], 1));
    // Selection alone is not layout-affecting: a second refresh with the same selection index
    // and unchanged text should report no change.
    const changed = hotbar.refresh(makeHotbar([makeSlot(), makeSlot()], 1));
    expect(changed).toBe(false);
  });

  it("out-of-stock non-selected slots are dimmed via opacity", () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ available: false }), makeSlot({ available: true })], 1));
    const slot0 = hotbar.root.children[0]!;
    const slot1 = hotbar.root.children[1]!;
    expect(slot0.opacity).toBe(0.45);
    expect(slot1.opacity).toBe(1);
  });

  it("selected-but-unavailable slot is NOT dimmed (selection wins)", () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ available: false })], 0));
    expect(hotbar.root.children[0]!.opacity).toBe(1);
  });

  it("a slot with a resolvable sprite frame clears its ASCII glyph label (icon drawn instead)", () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ frame: "tool/hoe", glyph: "H" })]));
    // The glyph label (2nd child of the first slot box: badge, glyph, caption, count) is empty.
    const slotBox = hotbar.root.children[0]!;
    const glyphLbl = slotBox.children[1] as LabelNode;
    expect(glyphLbl.text).toBe("");
  });

  it("a slot with no sprite frame falls back to its ASCII glyph text", () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ frame: "", glyph: "H" })]));
    const slotBox = hotbar.root.children[0]!;
    const glyphLbl = slotBox.children[1] as LabelNode;
    expect(glyphLbl.text).toBe("H");
  });

  it("caption colour dims to EDG.slate when a non-selected slot is unavailable", () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ available: false }), makeSlot({ available: true })], 1));
    const slotBox = hotbar.root.children[0]!;
    const captionLbl = slotBox.children[2] as LabelNode;
    expect(captionLbl.color).toBe(EDG.slate);
  });

  // --- Drag-to-rearrange (reinvention: drag-from-world hotbar, reuses swap-slots) ---

  function down(x: number, y: number): void {
    window.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: x, clientY: y }));
  }
  function move(x: number, y: number): void {
    window.dispatchEvent(new MouseEvent("mousemove", { button: 0, clientX: x, clientY: y }));
  }
  function up(x: number, y: number): void {
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0, clientX: x, clientY: y }));
  }

  async function centres(hotbar: Hotbar): Promise<Array<{ x: number; y: number }>> {
    const { computeLayout } = await import("@engine/ui");
    computeLayout(hotbar.root, 0, 0);
    return hotbar.root.children.map((c) => ({
      x: c.rect.x + c.rect.width / 2,
      y: c.rect.y + c.rect.height / 2,
    }));
  }

  it("dragging a filled slot onto another swaps them via swapSlots", async () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ glyph: "H" }), makeSlot({ glyph: "S" })], 0));
    const c = await centres(hotbar);
    down(c[0]!.x, c[0]!.y);
    move(c[0]!.x + 20, c[0]!.y); // past DRAG_THRESHOLD → drag active
    up(c[1]!.x, c[1]!.y);
    expect(swaps).toEqual([[0, 1]]);
  });

  it("a plain click (no movement past threshold) does NOT swap", async () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ glyph: "H" }), makeSlot({ glyph: "S" })], 0));
    const c = await centres(hotbar);
    down(c[0]!.x, c[0]!.y);
    up(c[0]!.x, c[0]!.y);
    expect(swaps).toEqual([]);
  });

  it("does not swap when the client is not the owner", async () => {
    ownerFlag = false;
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ glyph: "H" }), makeSlot({ glyph: "S" })], 0));
    const c = await centres(hotbar);
    down(c[0]!.x, c[0]!.y);
    move(c[0]!.x + 20, c[0]!.y);
    up(c[1]!.x, c[1]!.y);
    expect(swaps).toEqual([]);
  });

  it("dropping back on the source slot does not swap", async () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ glyph: "H" }), makeSlot({ glyph: "S" })], 0));
    const c = await centres(hotbar);
    down(c[0]!.x, c[0]!.y);
    move(c[0]!.x + 20, c[0]!.y);
    up(c[0]!.x, c[0]!.y);
    expect(swaps).toEqual([]);
  });

  it("after destroy(), drags no longer swap (listeners removed)", async () => {
    const hotbar = createHotbarT();
    hotbar.refresh(makeHotbar([makeSlot({ glyph: "H" }), makeSlot({ glyph: "S" })], 0));
    const c = await centres(hotbar);
    hotbar.destroy();
    down(c[0]!.x, c[0]!.y);
    move(c[0]!.x + 20, c[0]!.y);
    up(c[1]!.x, c[1]!.y);
    expect(swaps).toEqual([]);
  });
});
