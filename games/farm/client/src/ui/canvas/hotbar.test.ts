import { describe, it, expect, beforeEach } from "vitest";
import { resetNodeIds } from "@engine/ui";
import type { UINode, LabelNode } from "@engine/ui";
import { EDG } from "@engine/core";
import { createHotbar } from "./hotbar";
import type { PlayerHotbar, HotbarSlotState } from "@farm/sim-core/snapshot";

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
  });

  it("builds a tree with 8 slots regardless of input size", () => {
    const hotbar = createHotbar();
    // 8 slot roots directly under the panel root.
    expect(hotbar.root.children.length).toBe(8);
  });

  it("first refresh reports changed and sets slot caption/count", () => {
    const hotbar = createHotbar();
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
    const hotbar = createHotbar();
    hotbar.refresh(makeHotbar([makeSlot()]));
    const texts = labelTexts(hotbar.root);
    for (let i = 1; i <= 8; i++) expect(texts).toContain(`${i}`);
  });

  it("refresh(null) hides all slots (opacity 0) and reports changed once", () => {
    const hotbar = createHotbar();
    hotbar.refresh(makeHotbar([makeSlot()]));
    const changed = hotbar.refresh(null);
    expect(changed).toBe(true);
    for (const slotRoot of hotbar.root.children) {
      expect(slotRoot.opacity).toBe(0);
    }
  });

  it("selected slot is tracked (drawIcons draws a gold border for it) without affecting layout", () => {
    const hotbar = createHotbar();
    hotbar.refresh(makeHotbar([makeSlot(), makeSlot()], 1));
    // Selection alone is not layout-affecting: a second refresh with the same selection index
    // and unchanged text should report no change.
    const changed = hotbar.refresh(makeHotbar([makeSlot(), makeSlot()], 1));
    expect(changed).toBe(false);
  });

  it("out-of-stock non-selected slots are dimmed via opacity", () => {
    const hotbar = createHotbar();
    hotbar.refresh(makeHotbar([makeSlot({ available: false }), makeSlot({ available: true })], 1));
    const slot0 = hotbar.root.children[0]!;
    const slot1 = hotbar.root.children[1]!;
    expect(slot0.opacity).toBe(0.45);
    expect(slot1.opacity).toBe(1);
  });

  it("selected-but-unavailable slot is NOT dimmed (selection wins)", () => {
    const hotbar = createHotbar();
    hotbar.refresh(makeHotbar([makeSlot({ available: false })], 0));
    expect(hotbar.root.children[0]!.opacity).toBe(1);
  });

  it("a slot with a resolvable sprite frame clears its ASCII glyph label (icon drawn instead)", () => {
    const hotbar = createHotbar();
    hotbar.refresh(makeHotbar([makeSlot({ frame: "tool/hoe", glyph: "H" })]));
    // The glyph label (2nd child of the first slot box: badge, glyph, caption, count) is empty.
    const slotBox = hotbar.root.children[0]!;
    const glyphLbl = slotBox.children[1] as LabelNode;
    expect(glyphLbl.text).toBe("");
  });

  it("a slot with no sprite frame falls back to its ASCII glyph text", () => {
    const hotbar = createHotbar();
    hotbar.refresh(makeHotbar([makeSlot({ frame: "", glyph: "H" })]));
    const slotBox = hotbar.root.children[0]!;
    const glyphLbl = slotBox.children[1] as LabelNode;
    expect(glyphLbl.text).toBe("H");
  });

  it("caption colour dims to EDG.slate when a non-selected slot is unavailable", () => {
    const hotbar = createHotbar();
    hotbar.refresh(makeHotbar([makeSlot({ available: false }), makeSlot({ available: true })], 1));
    const slotBox = hotbar.root.children[0]!;
    const captionLbl = slotBox.children[2] as LabelNode;
    expect(captionLbl.color).toBe(EDG.slate);
  });
});
