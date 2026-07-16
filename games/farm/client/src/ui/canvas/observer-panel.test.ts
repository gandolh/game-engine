import { describe, it, expect } from "vitest";
import { computeLayout } from "@engine/ui";
import { createObserverPanel } from "./observer-panel";
import type { ObserverPanelActions } from "./observer-panel";
import type { UINode, ButtonNode } from "@engine/ui";
import type { ObserverSnapshot } from "@farm/sim-core/snapshot";

/** Collect every button in the tree, in pre-order. */
function buttons(node: UINode, out: ButtonNode[] = []): ButtonNode[] {
  if (node.kind === "button") out.push(node);
  for (const child of node.children) buttons(child, out);
  return out;
}

function makeSnapshot(overrides: Partial<ObserverSnapshot> = {}): ObserverSnapshot {
  return {
    day: 3,
    season: "spring",
    weather: { condition: "sunny", multiplier: 1.1 },
    forecast: [{ condition: "rain", confidence: 0.8 }],
    farmers: [
      {
        id: 1,
        name: "Pip",
        personality: "conservative",
        gold: 42,
        crops: { wheat: 3 },
        fsm: "PERCEIVE",
        apCurrent: 5,
        apMax: 10,
        apPenaltyPending: false,
        region: "north",
        currentIntention: "water",
        nextIntention: "harvest",
        reasons: ["thirsty crop"],
        skills: { farming: 2, foraging: 0, fishing: 0, mining: 0 },
        hasGreenhouse: false,
      },
      {
        id: 2,
        name: "Ada",
        personality: "aggressive",
        gold: 100,
        crops: {},
        fsm: "ACT",
        apCurrent: 8,
        apMax: 10,
        apPenaltyPending: true,
        region: "south",
        currentIntention: null,
        nextIntention: null,
        reasons: [],
        skills: { farming: 1, foraging: 1, fishing: 1, mining: 1 },
        hasGreenhouse: true,
      },
    ],
    ...overrides,
  };
}

function makeActions(): ObserverPanelActions & { calls: Array<number | null> } {
  const calls: Array<number | null> = [];
  return {
    calls,
    onSelectFarmer(id) {
      calls.push(id);
    },
  };
}

describe("createObserverPanel", () => {
  it("first refresh renders header/weather/forecast and reports changed", () => {
    const panel = createObserverPanel(makeActions());
    const changed = panel.refresh(makeSnapshot());
    expect(changed).toBe(true);
  });

  it("renders one clickable row per farmer with expected content", () => {
    const panel = createObserverPanel(makeActions());
    panel.refresh(makeSnapshot());

    const rows = buttons(panel.root).filter((b) => b.label.includes("Pip") || b.label.includes("Ada"));
    expect(rows.length).toBe(2);

    const pipRow = rows.find((r) => r.label.includes("Pip"))!;
    expect(pipRow.label).toContain("Pip (conservative)");
    expect(pipRow.label).toContain("Gold: 42");
    expect(pipRow.label).toContain("WHE:3");

    const adaRow = rows.find((r) => r.label.includes("Ada"))!;
    expect(adaRow.label).toContain("AP: 8/10 (penalty)");
    expect(adaRow.label).toContain("[GH]");
  });

  it("clicking a farmer row follows it, and re-clicking un-follows it", () => {
    const actions = makeActions();
    const panel = createObserverPanel(actions);
    panel.refresh(makeSnapshot());

    const pipRow = buttons(panel.root).find((b) => b.label.includes("Pip"))!;
    pipRow.onActivate?.();
    expect(actions.calls).toEqual([1]);

    // Re-refresh to reflect the follow, then click again to unfollow.
    panel.refresh(makeSnapshot());
    const pipRowAgain = buttons(panel.root).find((b) => b.label.includes("Pip"))!;
    pipRowAgain.onActivate?.();
    expect(actions.calls).toEqual([1, null]);
  });

  it("shows the followed farmer's reasoning ('why') only while focused", () => {
    const actions = makeActions();
    const panel = createObserverPanel(actions);
    panel.refresh(makeSnapshot());

    let pipRow = buttons(panel.root).find((b) => b.label.includes("Pip ("))!;
    expect(pipRow.label).not.toContain("Now:");

    pipRow.onActivate?.();
    panel.refresh(makeSnapshot());
    pipRow = buttons(panel.root).find((b) => b.label.includes("Pip ("))!;
    expect(pipRow.label).toContain("Now: water");
    expect(pipRow.label).toContain("thirsty crop");
  });

  it("the reset button label reflects the followed farmer's name", () => {
    const actions = makeActions();
    const panel = createObserverPanel(actions);
    panel.refresh(makeSnapshot());

    const resetBtn = buttons(panel.root).find((b) => b.label.includes("Reset") || b.label.includes("Unfollow"))!;
    expect(resetBtn.label).toBe("Reset view");

    const pipRow = buttons(panel.root).find((b) => b.label.includes("Pip"))!;
    pipRow.onActivate?.();
    panel.refresh(makeSnapshot());

    const resetBtnAfter = buttons(panel.root).find((b) => b.label.includes("Unfollow"))!;
    expect(resetBtnAfter.label).toBe("Unfollow Pip");
  });

  it("removes a farmer's row when it drops out of the snapshot", () => {
    const panel = createObserverPanel(makeActions());
    panel.refresh(makeSnapshot());
    expect(buttons(panel.root).some((b) => b.label.includes("Ada"))).toBe(true);

    panel.refresh(makeSnapshot({ farmers: [makeSnapshot().farmers[0]!] }));
    expect(buttons(panel.root).some((b) => b.label.includes("Ada"))).toBe(false);
  });

  it("refresh returns false when nothing layout-affecting changed", () => {
    const panel = createObserverPanel(makeActions());
    const snap = makeSnapshot();
    panel.refresh(snap);
    const again = panel.refresh(makeSnapshot());
    expect(again).toBe(false);
  });

  it("wheel() scrolls the list without throwing", () => {
    const panel = createObserverPanel(makeActions());
    panel.refresh(makeSnapshot());
    expect(() => panel.wheel(50)).not.toThrow();
  });

  describe("layout stability (flicker regression)", () => {
    // Regression: `visibleRows.layout = { width, height }` used to REPLACE the whole layout
    // object (dropping `align: "stretch"`), so each farmer row fell back to its own intrinsic
    // width — the widest line of its multi-line label. That text changes almost every tick, so
    // the row (and, transitively, the panel) visibly grew/shrank in width on nearly every
    // refresh — the reported "Farmers window flickers when changes are applied".
    it("the panel's width stays pinned regardless of how long a farmer's row text is", () => {
      const panel = createObserverPanel(makeActions());
      panel.refresh(makeSnapshot());
      computeLayout(panel.root, 0, 0);
      const shortWidth = panel.root.rect.width;

      const longSnap = makeSnapshot({
        farmers: [
          {
            ...makeSnapshot().farmers[0]!,
            name: "A Farmer With An Extremely Long Name That Would Widen An Unstretched Row",
          },
          makeSnapshot().farmers[1]!,
        ],
      });
      panel.refresh(longSnap);
      computeLayout(panel.root, 0, 0);
      const longWidth = panel.root.rect.width;

      expect(longWidth).toBe(shortWidth);
    });

    it("every farmer row is stretched to the panel's fixed list width", () => {
      const panel = createObserverPanel(makeActions());
      panel.refresh(makeSnapshot());
      computeLayout(panel.root, 0, 0);

      const rows = buttons(panel.root).filter((b) => b.label.includes("Pip") || b.label.includes("Ada"));
      expect(rows.length).toBe(2);
      const widths = new Set(rows.map((r) => r.rect.width));
      expect(widths.size).toBe(1);
    });
  });
});
