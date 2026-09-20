/**
 * Tests for the viewport-fit guard (`fits-viewport.ts`) — the assertion that was missing when the
 * 2026-09-20 playtest found off-screen controls in two games at once.
 */
import { describe, it, expect } from "vitest";
import { box, button, label } from "../widget/node";
import { computeLayout } from "./layout";
import { assertFitsViewport, findViewportOverflows, MIN_VIEWPORT } from "./fits-viewport";

const VIEWPORT = { width: 200, height: 100 };

describe("MIN_VIEWPORT", () => {
  it("is the 1280x640 floor recorded in decisions.md", () => {
    // Pinned deliberately: raising the floor should break this test and make someone look at the
    // decision entry, not silently re-baseline every game's HUD test.
    expect(MIN_VIEWPORT).toEqual({ width: 1280, height: 640 });
  });
});

describe("findViewportOverflows", () => {
  it("finds nothing when every interactive node is inside the box", () => {
    const root = box({ direction: "column", gap: 4 }, [button("ok"), label("hi")]);
    computeLayout(root, 0, 0, undefined, VIEWPORT);
    expect(findViewportOverflows(root, VIEWPORT)).toEqual([]);
  });

  it("reports a button pushed past the bottom edge, with the side it crossed", () => {
    // A column taller than the viewport: the later buttons land below it, exactly the MateQuest
    // keypad shape.
    const buttons = Array.from({ length: 8 }, (_, i) => button(`b${i}`));
    const root = box({ direction: "column", gap: 10 }, buttons);
    computeLayout(root, 0, 0, undefined, VIEWPORT);

    const bad = findViewportOverflows(root, VIEWPORT);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.every((o) => o.sides.includes("bottom"))).toBe(true);
    // The LAST button is the worst offender, and the report keeps tree order.
    expect(bad[bad.length - 1]?.name).toBe("b7");
  });

  it("reports a button pushed past the right edge", () => {
    const root = box({ direction: "row", gap: 10 }, Array.from({ length: 12 }, (_, i) => button(`x${i}`)));
    computeLayout(root, 0, 0, undefined, VIEWPORT);

    const bad = findViewportOverflows(root, VIEWPORT);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.every((o) => o.sides.includes("right"))).toBe(true);
  });

  it("ignores labels by default and counts them under includeContent", () => {
    const root = box({ direction: "column" }, [label("x".repeat(400))]);
    computeLayout(root, 0, 0, undefined, VIEWPORT);

    expect(findViewportOverflows(root, VIEWPORT)).toEqual([]);
    const withContent = findViewportOverflows(root, VIEWPORT, { includeContent: true });
    expect(withContent).toHaveLength(1);
    expect(withContent[0]?.kind).toBe("label");
  });

  it("skips zero-area nodes — an unmounted subtree is not an overflow", () => {
    // A blank label measures 0x0; it cannot be seen, so it cannot be off-screen.
    const root = box({ direction: "column" }, [label("")]);
    computeLayout(root, 0, 0, undefined, VIEWPORT);
    expect(findViewportOverflows(root, VIEWPORT, { includeContent: true })).toEqual([]);
  });

  it("does not flag a container that is wider than the box while its leaves fit", () => {
    // Only leaves are judged: a padded/centred container may legitimately overhang.
    const root = box({ direction: "row", padding: 500 }, [button("inside")]);
    computeLayout(root, 0, 0, undefined, VIEWPORT);
    const bad = findViewportOverflows(root, VIEWPORT);
    // The button itself is pushed out by the padding, so it IS reported — but no `box` is.
    expect(bad.every((o) => o.kind !== "box")).toBe(true);
  });
});

describe("assertFitsViewport", () => {
  it("passes silently when the tree fits", () => {
    const root = box({ direction: "column" }, [button("fine")]);
    computeLayout(root, 0, 0, undefined, VIEWPORT);
    expect(() => assertFitsViewport(root, VIEWPORT)).not.toThrow();
  });

  it("names every offender, not just the first", () => {
    const root = box({ direction: "column", gap: 60 }, [button("a"), button("b"), button("c")]);
    computeLayout(root, 0, 0, undefined, VIEWPORT);

    let message = "";
    try {
      assertFitsViewport(root, VIEWPORT, { what: "test surface" });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("test surface");
    expect(message).toContain("200×100");
    // With gap 60 the buttons land at y=6/88/170, so "b" and "c" both fall out of a
    // 100px-tall box — and both must appear, because these bugs come in families.
    expect(message).toContain('"b"');
    expect(message).toContain('"c"');
  });
});
