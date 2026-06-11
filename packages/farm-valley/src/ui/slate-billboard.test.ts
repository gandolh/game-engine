import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlateBillboardPanel } from "./slate-billboard";
import type { SlateEntry } from "./slate-billboard";

function makeOffer(
  offerId: string,
  crop: "radish" | "wheat" | "pumpkin",
  unitPrice: number,
  quantity: number,
  remaining: number,
): SlateEntry {
  return { offerId, crop, unitPrice, quantity, remaining };
}

function makeSlate(): SlateEntry[] {
  return [
    makeOffer("offer-1", "radish", 5, 10, 10),
    makeOffer("offer-2", "wheat", 9, 8, 8),
    makeOffer("offer-3", "pumpkin", 18, 6, 6),
    makeOffer("offer-4", "radish", 6, 12, 12),
    makeOffer("offer-5", "wheat", 11, 5, 5),
  ];
}

describe("SlateBillboardPanel", () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
  });

  it("renders all offer rows on first update", () => {
    const panel = new SlateBillboardPanel(parent);
    panel.update(makeSlate());

    const rows = parent.querySelectorAll("[data-offer-id]");
    expect(rows.length).toBe(5);
    panel.destroy();
  });

  it("shows crop, price and remaining/quantity for each offer", () => {
    const panel = new SlateBillboardPanel(parent);
    panel.update([
      makeOffer("o1", "radish", 5, 10, 7),
      makeOffer("o2", "pumpkin", 20, 6, 3),
    ]);

    const text = parent.textContent ?? "";
    // Crop name (capitalized), price, and remaining/quantity each render in their own element.
    expect(text).toContain("Radish");
    expect(text).toContain("5g");
    expect(text).toContain("7/10 left");
    expect(text).toContain("Pumpkin");
    expect(text).toContain("20g");
    expect(text).toContain("3/6 left");
    panel.destroy();
  });

  it("updates remaining without recreating row elements", () => {
    const panel = new SlateBillboardPanel(parent);
    const slate = makeSlate();
    panel.update(slate);

    // Capture the row element references
    const rowsBefore = Array.from(
      parent.querySelectorAll("[data-offer-id]"),
    ) as HTMLElement[];
    expect(rowsBefore.length).toBe(5);

    // Decrement remaining on the first offer
    const updatedSlate = slate.map((o, i) =>
      i === 0 ? { ...o, remaining: o.remaining - 3 } : o,
    );
    panel.update(updatedSlate);

    const rowsAfter = Array.from(
      parent.querySelectorAll("[data-offer-id]"),
    ) as HTMLElement[];
    expect(rowsAfter.length).toBe(5);

    // Same DOM elements — no recreation
    for (let i = 0; i < 5; i++) {
      expect(rowsAfter[i]).toBe(rowsBefore[i]);
    }

    // Updated text is reflected
    const text = parent.textContent ?? "";
    expect(text).toContain("Radish");
    expect(text).toContain("5g");
    expect(text).toContain("7/10 left");
    panel.destroy();
  });

  it("hides cleanly when slate is empty", () => {
    const panel = new SlateBillboardPanel(parent);
    panel.update(makeSlate());

    // Confirm rows were rendered
    expect(parent.querySelectorAll("[data-offer-id]").length).toBe(5);

    // Now clear
    panel.update([]);

    expect(parent.querySelectorAll("[data-offer-id]").length).toBe(0);
    const panelEl = parent.children[0] as HTMLElement;
    expect(panelEl.style.display).toBe("none");
    panel.destroy();
  });

  it("does not mutate textContent when offer data is unchanged (no DOM churn)", () => {
    const panel = new SlateBillboardPanel(parent);
    const slate = makeSlate();
    panel.update(slate);

    const rows = Array.from(
      parent.querySelectorAll("[data-offer-id]"),
    ) as HTMLElement[];
    expect(rows.length).toBeGreaterThan(0);

    const setterCalls: string[] = [];
    const restores: (() => void)[] = [];

    for (const row of rows) {
      const descendants = Array.from(row.querySelectorAll("*")) as HTMLElement[];
      for (const el of descendants) {
        const orig = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
        if (!orig) continue;
        const origGet = orig.get;
        const origSet = orig.set;
        if (!origGet || !origSet) continue;
        const spy = vi.fn((val: string) => {
          setterCalls.push(val);
          origSet.call(el, val);
        });
        Object.defineProperty(el, "textContent", {
          get: origGet.bind(el),
          set: spy,
          configurable: true,
        });
        restores.push(() =>
          Object.defineProperty(el, "textContent", {
            get: origGet.bind(el),
            set: origSet.bind(el),
            configurable: true,
          }),
        );
      }
    }

    // Second update with identical data — no textContent setter should fire
    panel.update(slate);
    expect(setterCalls.length).toBe(0);

    for (const restore of restores) restore();
    panel.destroy();
  });

  it("setVisible hides and shows the panel", () => {
    const panel = new SlateBillboardPanel(parent);
    panel.update(makeSlate());
    panel.setVisible(false);
    const panelEl = parent.children[0] as HTMLElement;
    expect(panelEl.style.display).toBe("none");
    panel.setVisible(true);
    expect(panelEl.style.display).toBe("");
    panel.destroy();
  });

  it("destroy removes the panel element", () => {
    const panel = new SlateBillboardPanel(parent);
    panel.update(makeSlate());
    panel.destroy();
    expect(parent.children.length).toBe(0);
  });
});
