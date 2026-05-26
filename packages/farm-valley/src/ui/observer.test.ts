import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObserverPanel } from "./observer";
import type { ObserverSnapshot } from "./observer";

function makeSnapshot(overrides?: Partial<ObserverSnapshot>): ObserverSnapshot {
  return {
    day: 1,
    weather: { condition: "Sunny", multiplier: 1.0 },
    forecast: [
      { condition: "Cloudy", confidence: 0.7 },
      { condition: "Rainy", confidence: 0.5 },
    ],
    farmers: [
      {
        id: 3,
        name: "Alice",
        personality: "cautious",
        gold: 100,
        crops: { radish: 2, wheat: 5, pumpkin: 1 },
        fsm: "idle",
        apCurrent: 4,
        apMax: 6,
        apPenaltyPending: false,
        region: "home",
      },
      {
        id: 5,
        name: "Bob",
        personality: "bold",
        gold: 200,
        crops: { radish: 0, wheat: 3, pumpkin: 4 },
        fsm: "harvest",
        apCurrent: 3,
        apMax: 6,
        apPenaltyPending: true,
        region: "traveling",
      },
    ],
    ...overrides,
  };
}

describe("ObserverPanel", () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
  });

  it("renders rows for two farmers on first update", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    // Should have 2 farmer rows in the container
    const rows = parent.querySelectorAll("[data-farmer-id]");
    expect(rows.length).toBe(2);
    panel.destroy();
  });

  it("shows farmer names after update", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    const text = parent.textContent ?? "";
    expect(text).toContain("Alice");
    expect(text).toContain("Bob");
    panel.destroy();
  });

  it("shows penalty suffix when apPenaltyPending is true", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    const text = parent.textContent ?? "";
    expect(text).toContain("penalty");
    panel.destroy();
  });

  it("does not set textContent on unchanged rows (no DOM churn)", () => {
    const panel = new ObserverPanel(parent);
    const snapshot = makeSnapshot();
    panel.update(snapshot);

    // Collect all text-bearing leaf elements within farmer rows
    const rows = Array.from(parent.querySelectorAll("[data-farmer-id]")) as HTMLElement[];
    expect(rows.length).toBeGreaterThan(0);

    // Spy on the textContent setter of each farmer row's children
    const setterCalls: string[] = [];
    const spies: (() => void)[] = [];

    for (const row of rows) {
      const descendants = Array.from(row.querySelectorAll("*")) as HTMLElement[];
      for (const el of descendants) {
        const orig = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
        if (orig === undefined) continue;
        const origGet = orig.get;
        const origSet = orig.set;
        if (origGet === undefined || origSet === undefined) continue;
        const spy = vi.fn((val: string) => {
          setterCalls.push(val);
          origSet.call(el, val);
        });
        Object.defineProperty(el, "textContent", {
          get: origGet.bind(el),
          set: spy,
          configurable: true,
        });
        spies.push(() =>
          Object.defineProperty(el, "textContent", {
            get: origGet.bind(el),
            set: origSet.bind(el),
            configurable: true,
          }),
        );
      }
    }

    // Second update with identical data — no textContent setter should be called
    panel.update(snapshot);
    expect(setterCalls.length).toBe(0);

    // Restore
    for (const restore of spies) restore();
    panel.destroy();
  });

  it("sorts farmers by id ascending (id 3 before id 5)", () => {
    const panel = new ObserverPanel(parent);
    // Provide farmers in reverse order
    const snapshot = makeSnapshot({
      farmers: [
        {
          id: 5,
          name: "Bob",
          personality: "bold",
          gold: 200,
          crops: { radish: 0, wheat: 3, pumpkin: 4 },
          fsm: "harvest",
          apCurrent: 3,
          apMax: 6,
          apPenaltyPending: false,
          region: "village",
        },
        {
          id: 3,
          name: "Alice",
          personality: "cautious",
          gold: 100,
          crops: { radish: 2, wheat: 5, pumpkin: 1 },
          fsm: "idle",
          apCurrent: 4,
          apMax: 6,
          apPenaltyPending: false,
          region: "home",
        },
      ],
    });
    panel.update(snapshot);

    const rows = Array.from(
      parent.querySelectorAll("[data-farmer-id]"),
    ) as HTMLElement[];
    expect(rows.length).toBe(2);
    expect(rows[0]?.dataset["farmerId"]).toBe("3");
    expect(rows[1]?.dataset["farmerId"]).toBe("5");
    panel.destroy();
  });

  it("renders the region column for each farmer", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    const rows = Array.from(
      parent.querySelectorAll("[data-farmer-id]"),
    ) as HTMLElement[];
    expect(rows.length).toBe(2);

    // Each row should have exactly one region field.
    const regionCells = parent.querySelectorAll('[data-field="region"]');
    expect(regionCells.length).toBe(2);

    const text = parent.textContent ?? "";
    expect(text).toContain("Region: home");
    expect(text).toContain("Region: traveling");
    panel.destroy();
  });

  it("updates the region field when the snapshot changes", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());
    expect(parent.textContent ?? "").toContain("Region: home");

    panel.update(
      makeSnapshot({
        farmers: [
          {
            id: 3,
            name: "Alice",
            personality: "cautious",
            gold: 100,
            crops: { radish: 2, wheat: 5, pumpkin: 1 },
            fsm: "idle",
            apCurrent: 4,
            apMax: 6,
            apPenaltyPending: false,
            region: "village",
          },
          {
            id: 5,
            name: "Bob",
            personality: "bold",
            gold: 200,
            crops: { radish: 0, wheat: 3, pumpkin: 4 },
            fsm: "harvest",
            apCurrent: 3,
            apMax: 6,
            apPenaltyPending: true,
            region: "farm-otto",
          },
        ],
      }),
    );
    const text = parent.textContent ?? "";
    expect(text).toContain("Region: village");
    expect(text).toContain("Region: farm-otto");
    expect(text).not.toContain("Region: home");
    expect(text).not.toContain("Region: traveling");
    panel.destroy();
  });

  it("destroy removes the panel element", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());
    panel.destroy();
    expect(parent.children.length).toBe(0);
  });

  it("setVisible hides and shows the panel", () => {
    const panel = new ObserverPanel(parent);
    panel.setVisible(false);
    const panelEl = parent.children[0] as HTMLElement;
    expect(panelEl.style.display).toBe("none");
    panel.setVisible(true);
    expect(panelEl.style.display).toBe("");
    panel.destroy();
  });

  // brief-11: focus-camera — click row fires callback with farmer id
  it("clicking a farmer row fires the onFarmerClick callback with the farmer id", () => {
    const panel = new ObserverPanel(parent);
    const cb = vi.fn();
    panel.setOnFarmerClick(cb);
    panel.update(makeSnapshot());

    // Find the row for farmer id=3 (Alice)
    const row = parent.querySelector('[data-farmer-id="3"]') as HTMLElement | null;
    expect(row).not.toBeNull();
    row!.click();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(3);
    panel.destroy();
  });

  // brief-11: focus-camera — reset view button fires callback with null
  it("clicking Reset view fires the onFarmerClick callback with null", () => {
    const panel = new ObserverPanel(parent);
    const cb = vi.fn();
    panel.setOnFarmerClick(cb);
    panel.update(makeSnapshot());

    const resetBtn = parent.querySelector("button") as HTMLButtonElement | null;
    expect(resetBtn).not.toBeNull();
    expect(resetBtn!.textContent).toContain("Reset view");
    resetBtn!.click();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(null);
    panel.destroy();
  });
});
