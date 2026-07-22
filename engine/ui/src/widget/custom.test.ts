import { describe, it, expect, vi } from "vitest";
import { custom, box, panel } from "./node";
import type { Rect } from "./node";
import { computeLayout } from "../layout/layout";
import { renderTree } from "./render";
import type { UISurface } from "../render/ui-surface";

/** A no-op surface — the custom-node tests only care about WHAT the draw callback is handed. */
function fakeSurface(): UISurface {
  return {
    begin: () => {},
    end: () => {},
    push: () => {},
    rect: () => {},
    sprite: () => {},
  } as unknown as UISurface;
}

describe("custom node (escape hatch)", () => {
  it("is sized by layout.width/height and receives that rect at the placed position", () => {
    const seen: Rect[] = [];
    const node = custom((_s, rect) => void seen.push({ ...rect }), { width: 220, height: 60 });

    computeLayout(node, 30, 40);
    expect(node.rect).toEqual({ x: 30, y: 40, width: 220, height: 60 });

    renderTree(fakeSurface(), node);
    expect(seen).toEqual([{ x: 30, y: 40, width: 220, height: 60 }]);
  });

  it("stretches to a parent's cross axis like any other leaf (align: stretch)", () => {
    const cust = custom(() => {}, { height: 12 });
    const root = box({ direction: "column", align: "stretch", padding: 0, width: 100 }, [cust]);

    computeLayout(root, 0, 0);
    expect(cust.rect.width).toBe(100);
    expect(cust.rect.height).toBe(12);
  });

  it("draws in sibling order (after earlier siblings) and under the subtree's multiplied alpha", () => {
    const order: string[] = [];
    let seenAlpha = -1;
    const first = custom(() => void order.push("first"), { width: 10, height: 10 });
    const second = custom((_s, _r, alpha) => {
      order.push("second");
      seenAlpha = alpha;
    }, { width: 10, height: 10 });

    const root = panel({ direction: "column", gap: 0 }, [first, second]);
    root.opacity = 0.5;

    computeLayout(root, 0, 0);
    renderTree(fakeSurface(), root);

    expect(order).toEqual(["first", "second"]);
    expect(seenAlpha).toBeCloseTo(0.5, 6); // parent opacity multiplied down to the leaf
  });

  it("as an overlay child, fills the parent's inner box and does NOT shift flow siblings", () => {
    // Two fixed-size flow boxes in a column + an overlay custom node LAST. The overlay must not
    // consume a slot/gap (siblings stay where they'd be without it) and must fill the inner box.
    const a = box({ height: 20 }, []);
    const b = box({ height: 20 }, []);
    let overlayRect: Rect | null = null;
    const ov = custom((_s, rect) => void (overlayRect = { ...rect }), { overlay: true });

    const root = panel({ direction: "column", align: "stretch", gap: 4, padding: 6, width: 100 }, [a, b, ov]);
    computeLayout(root, 0, 0);

    // Flow siblings: first at inner top, second one height+gap below — unaffected by the overlay.
    expect(a.rect).toEqual({ x: 6, y: 6, width: 88, height: 20 });
    expect(b.rect).toEqual({ x: 6, y: 30, width: 88, height: 20 });
    // Parent height = padding + 20 + gap + 20 + padding = 56 (overlay contributes nothing).
    expect(root.rect.height).toBe(56);

    // Overlay fills the inner content box (padding-inset).
    renderTree(fakeSurface(), root);
    expect(overlayRect).toEqual({ x: 6, y: 6, width: 88, height: 44 });
  });

  it("is skipped entirely when an ancestor is fully transparent (alpha 0 prunes the subtree)", () => {
    const draw = vi.fn();
    const cust = custom(draw, { width: 10, height: 10 });
    const root = box({}, [cust]);
    root.background = true;
    root.opacity = 0;

    computeLayout(root, 0, 0);
    renderTree(fakeSurface(), root);

    expect(draw).not.toHaveBeenCalled();
  });
});
