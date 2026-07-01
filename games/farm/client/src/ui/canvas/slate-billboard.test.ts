import { describe, it, expect } from "vitest";
import type { RendererLike, UIQuad } from "@engine/core/render";
import { UISurface } from "@engine/ui";
import { createSlateBillboard } from "./slate-billboard";
import type { SlateEntry } from "./slate-billboard";
import type { LabelNode, UINode } from "@engine/ui";

function labelTexts(node: UINode, out: LabelNode[] = []): LabelNode[] {
  if (node.kind === "label" && node.text.length > 0) out.push(node);
  for (const child of node.children) labelTexts(child, out);
  return out;
}

function offer(overrides: Partial<SlateEntry> = {}): SlateEntry {
  return {
    offerId: "o1",
    crop: "wheat",
    unitPrice: 8,
    quantity: 10,
    remaining: 10,
    ...overrides,
  };
}

class RecordingRenderer implements Partial<RendererLike> {
  quads: UIQuad[] = [];
  private open = false;
  beginUI(): void {
    this.open = true;
    this.quads = [];
  }
  pushUI(q: UIQuad): void {
    if (!this.open) throw new Error("pushUI outside begin/end");
    this.quads.push({ ...q });
  }
  endUI(): void {
    this.open = false;
  }
  addAtlas(): void {}
}

describe("createSlateBillboard", () => {
  it("first refresh renders an offer row (name + price + stock caption) and reports changed", () => {
    const slate = createSlateBillboard();
    const changed = slate.refresh([offer()]);
    expect(changed).toBe(true);

    const lines = labelTexts(slate.root).map((l) => l.text);
    expect(lines).toContain("Wheat");
    expect(lines).toContain("8g");
    expect(lines).toContain("10/10 left");
  });

  it("shows the empty-state label when there are no offers", () => {
    const slate = createSlateBillboard();
    slate.refresh([]);
    const lines = labelTexts(slate.root);
    const empty = lines.find((l) => l.text.includes("No offers"));
    expect(empty).toBeDefined();
    expect(empty!.opacity).not.toBe(0);
  });

  it("removes a row when its offer drops out of the slate", () => {
    const slate = createSlateBillboard();
    slate.refresh([offer({ offerId: "a", crop: "wheat" }), offer({ offerId: "b", crop: "corn" })]);
    expect(labelTexts(slate.root).some((l) => l.text === "Corn")).toBe(true);

    slate.refresh([offer({ offerId: "a", crop: "wheat" })]);
    expect(labelTexts(slate.root).some((l) => l.text === "Corn")).toBe(false);
  });

  it("refresh returns false when nothing layout-affecting changed", () => {
    const slate = createSlateBillboard();
    slate.refresh([offer()]);
    const again = slate.refresh([offer()]);
    expect(again).toBe(false);
  });

  it("wheel() scrolls without throwing", () => {
    const slate = createSlateBillboard();
    slate.refresh([offer()]);
    expect(() => slate.wheel(10)).not.toThrow();
  });

  it("drawIcons emits a coloured stock-bar fill rect for a visible row", () => {
    const slate = createSlateBillboard();
    slate.refresh([offer({ remaining: 1, quantity: 10 })]); // 10% remaining -> red

    const rec = new RecordingRenderer();
    const surface = new UISurface(rec as unknown as RendererLike);
    surface.begin();
    slate.drawIcons(surface);
    surface.end();

    // At least one solid-colour (non-atlas) quad should have been pushed for the bar fill.
    const solidQuads = rec.quads.filter((q) => q.atlasId === undefined);
    expect(solidQuads.length).toBeGreaterThan(0);
  });
});
