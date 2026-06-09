import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObserverPanel } from "./observer";
import type { ObserverSnapshot } from "./observer";

function makeSnapshot(overrides?: Partial<ObserverSnapshot>): ObserverSnapshot {
  return {
    day: 1,
    season: "spring",
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
        currentIntention: "plant",
        nextIntention: "sell-shopkeeper",
        reasons: ["plant radish: gold 100 >= reserve 30", "sell radish x2"],
        skills: { farming: 1, foraging: 1, fishing: 1, mining: 1 },
        hasGreenhouse: false,
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
        currentIntention: "travel",
        nextIntention: "post-offer",
        reasons: ["travel village: post offers"],
        skills: { farming: 1, foraging: 1, fishing: 1, mining: 1 },
        hasGreenhouse: false,
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

  it("shows the current season in the header (capitalized)", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot({ day: 30, season: "summer" }));

    const header = parent.querySelector("div") as HTMLElement;
    expect(header.textContent).toContain("Day 30");
    expect(header.textContent).toContain("Summer");
    panel.destroy();
  });

  // brief 43 — observer surfaces per-farmer skill levels + greenhouse marker.
  it("renders skill levels and a greenhouse marker for the farmer", () => {
    const panel = new ObserverPanel(parent);
    const snap = makeSnapshot();
    snap.farmers[0]!.skills = { farming: 7, foraging: 3, fishing: 2, mining: 5 };
    snap.farmers[0]!.hasGreenhouse = true;
    panel.update(snap);

    const text = parent.textContent ?? "";
    expect(text).toContain("Fa7");
    expect(text).toContain("Fo3");
    expect(text).toContain("Fi2");
    expect(text).toContain("Mi5");
    expect(text).toContain("[GH]"); // greenhouse marker
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
          currentIntention: null,
          nextIntention: null,
          reasons: [],
          skills: { farming: 1, foraging: 1, fishing: 1, mining: 1 },
          hasGreenhouse: false,
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
          currentIntention: null,
          nextIntention: null,
          reasons: [],
          skills: { farming: 1, foraging: 1, fishing: 1, mining: 1 },
          hasGreenhouse: false,
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
            currentIntention: null,
            nextIntention: null,
            reasons: [],
            skills: { farming: 1, foraging: 1, fishing: 1, mining: 1 },
            hasGreenhouse: false,
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
            currentIntention: null,
            nextIntention: null,
            reasons: [],
            skills: { farming: 1, foraging: 1, fishing: 1, mining: 1 },
            hasGreenhouse: false,
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

  // brief 19 — decision rationale ("why") renders only for the focused farmer
  it("renders current/next intention + reasons only for the focused farmer", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    // Initially nothing focused — both why panels hidden.
    let whyCells = Array.from(
      parent.querySelectorAll('[data-field="why"]'),
    ) as HTMLElement[];
    expect(whyCells.length).toBe(2);
    expect(whyCells.every((el) => el.style.display === "none")).toBe(true);

    // Focus Alice (id=3) by clicking, then re-render with a fresh snapshot.
    const aliceRow = parent.querySelector('[data-farmer-id="3"]') as HTMLElement;
    aliceRow.click();
    panel.update(makeSnapshot());

    const aliceWhy = aliceRow.querySelector('[data-field="why"]') as HTMLElement;
    expect(aliceWhy.style.display).toBe("");
    expect(aliceWhy.textContent).toContain("Now: plant");
    expect(aliceWhy.textContent).toContain("Next: sell-shopkeeper");
    expect(aliceWhy.textContent).toContain("plant radish: gold 100 >= reserve 30");

    // Bob (id=5) stays hidden.
    const bobRow = parent.querySelector('[data-farmer-id="5"]') as HTMLElement;
    const bobWhy = bobRow.querySelector('[data-field="why"]') as HTMLElement;
    expect(bobWhy.style.display).toBe("none");
    panel.destroy();
  });

  // discoverability — dynamic button label (Reset view ⇄ Unfollow {name})
  it("button reads 'Reset view' when unfocused and 'Unfollow {name}' once a farmer is followed", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    const resetBtn = parent.querySelector("button") as HTMLButtonElement;
    expect(resetBtn.textContent).toBe("Reset view");

    // Follow Alice (id=3).
    const aliceRow = parent.querySelector('[data-farmer-id="3"]') as HTMLElement;
    aliceRow.click();
    expect(resetBtn.textContent).toBe("Unfollow Alice");

    // Label survives a re-render with a fresh snapshot.
    panel.update(makeSnapshot());
    expect(resetBtn.textContent).toBe("Unfollow Alice");

    // Unfollow restores the default label.
    resetBtn.click();
    expect(resetBtn.textContent).toBe("Reset view");
    panel.destroy();
  });

  // discoverability — persistent hint line toggles on focus
  it("shows the 'Click a farmer to follow them' hint when unfocused and hides it while following", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    const text = parent.textContent ?? "";
    expect(text).toContain("Click a farmer to follow them");

    // The hint element is the sibling carrying that text; locate it.
    const hint = Array.from(parent.querySelectorAll("div")).find(
      (el) => el.textContent === "Click a farmer to follow them",
    ) as HTMLElement;
    expect(hint).toBeDefined();
    expect(hint.style.display).not.toBe("none");

    // Following a farmer hides the hint.
    const aliceRow = parent.querySelector('[data-farmer-id="3"]') as HTMLElement;
    aliceRow.click();
    expect(hint.style.display).toBe("none");

    // Unfollowing shows it again.
    const resetBtn = parent.querySelector("button") as HTMLButtonElement;
    resetBtn.click();
    expect(hint.style.display).not.toBe("none");
    panel.destroy();
  });

  // discoverability — stronger highlight on the focused row
  it("gives the focused row a thicker gold outline + tinted background", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    const aliceRow = parent.querySelector('[data-farmer-id="3"]') as HTMLElement;
    const bobRow = parent.querySelector('[data-farmer-id="5"]') as HTMLElement;

    // Unfocused: no outline / no tinted background.
    expect(aliceRow.style.outline).toBe("");

    aliceRow.click();
    expect(aliceRow.style.outline).toContain("2px");
    expect(aliceRow.style.outline.toLowerCase()).toContain("solid");
    expect(aliceRow.style.background).not.toBe("");
    // Bob (unfocused) keeps no highlight.
    expect(bobRow.style.outline).toBe("");
    expect(bobRow.style.background).toBe("");
    panel.destroy();
  });

  // discoverability — bold "Why:" header on the focused row's why block
  it("renders a bold 'Why:' header in the focused farmer's why block", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    const aliceRow = parent.querySelector('[data-farmer-id="3"]') as HTMLElement;
    aliceRow.click();
    panel.update(makeSnapshot());

    const why = aliceRow.querySelector('[data-field="why"]') as HTMLElement;
    const strong = why.querySelector("strong") as HTMLElement | null;
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe("Why:");
    expect(strong!.style.fontWeight).toBe("bold");
    // Decision trace still renders alongside the header.
    expect(why.textContent).toContain("Now: plant");
    panel.destroy();
  });

  it("hides the why panel again after focus is reset", () => {
    const panel = new ObserverPanel(parent);
    panel.update(makeSnapshot());

    const aliceRow = parent.querySelector('[data-farmer-id="3"]') as HTMLElement;
    aliceRow.click();
    panel.update(makeSnapshot());
    const aliceWhy = aliceRow.querySelector('[data-field="why"]') as HTMLElement;
    expect(aliceWhy.style.display).toBe("");

    const resetBtn = parent.querySelector("button") as HTMLButtonElement;
    resetBtn.click();
    panel.update(makeSnapshot());
    expect(aliceWhy.style.display).toBe("none");
    panel.destroy();
  });
});
