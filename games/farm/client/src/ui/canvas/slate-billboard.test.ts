import { describe, it, expect } from "vitest";
import type { RendererLike, UIQuad } from "@engine/core/render";
import { UISurface, computeLayout } from "@engine/ui";
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

describe("stock bar geometry", () => {
  it("the bar FILL sits inside its own track, never on the caption below", () => {
    // Regression: the track is only BAR_HEIGHT (5px) tall, but containers default to the THEME
    // padding — so the fill was laid out at `track.y + 6`, entirely below its own track and
    // straight on top of the "N/M left" caption (the fill is painted in a post-pass, so it won
    // the overlap and hid the text). Assert containment, which the padding: 0 fix guarantees.
    const slate = createSlateBillboard();
    const offers: SlateEntry[] = [
      { offerId: "o1", crop: "pumpkin", unitPrice: 17, quantity: 17, remaining: 17 },
    ];
    slate.refresh(offers);
    computeLayout(slate.root, 0, 0);

    const boxes: UINode[] = [];
    const walk = (n: UINode): void => {
      boxes.push(n);
      for (const c of n.children) walk(c);
    };
    walk(slate.root);

    const caption = boxes.find((n) => n.kind === "label" && (n as LabelNode).text.includes("left"));
    expect(caption, "the N/M left caption exists").toBeDefined();

    // The fill is the only zero-or-more-width box nested directly in a BAR_HEIGHT-tall box.
    const track = boxes.find((n) => n.kind === "box" && n.rect.height === 5 && n.children.length === 1);
    expect(track, "the bar track exists").toBeDefined();
    const fill = track!.children[0]!;

    expect(fill.rect.y, "fill top is on the track").toBe(track!.rect.y);
    expect(fill.rect.y + fill.rect.height, "fill bottom stays inside the track")
      .toBeLessThanOrEqual(track!.rect.y + track!.rect.height);
    expect(fill.rect.y + fill.rect.height, "fill never reaches the caption")
      .toBeLessThanOrEqual(caption!.rect.y);
  });
});
