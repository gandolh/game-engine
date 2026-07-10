/**
 * Tests for the in-canvas building inspect panel (Citadel inspect chunk 2). Exercises the
 * pure data-binding (description / production rate / scope / workers / level / connected) and
 * the throttle ("slowed") note for a producer, a service, and the tradingpost special case,
 * plus the footprint-origin selection hit-test. The render/input/a11y plumbing is the
 * framework's own (covered in @engine/ui); here we just prove this consumer drives it right.
 */
import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import type { ButtonNode, LabelNode, UINode } from "@engine/ui";
import type { BarterOffer, BuildingSnapshot } from "@citadel/sim-core";
import { createInspectPanel, type InspectPanelState } from "./inspect-panel";
import { buildingAtTile, findSelected } from "./selection";

function baseState(overrides: Partial<InspectPanelState> = {}): InspectPanelState {
  return {
    type: "bakery",
    level: 1,
    connected: true,
    workerCount: 1,
    outputBuffer: 0,
    season: "summer",
    // Affordable by default for the L1→L2 cost ({ planks: 4, stone: 4 }).
    stockpiles: { planks: 10, stone: 10, tools: 10 },
    // Top tier by default so the tier gate never masks affordability tests; the tier-locked
    // cases override peakTier explicitly below.
    peakTier: "Town",
    // Phase G trade menu: off by default (only relevant for type === "tradingpost"); trading-post
    // tests override these explicitly.
    traderPresent: false,
    traderOffers: [],
    ...overrides,
  };
}

function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function labels(root: UINode): LabelNode[] {
  return walk(root).filter((n): n is LabelNode => n.kind === "label");
}
function buttons(root: UINode): ButtonNode[] {
  return walk(root).filter((n): n is ButtonNode => n.kind === "button");
}
function texts(root: UINode): string[] {
  return labels(root).map((l) => l.text);
}
function find(root: UINode, prefix: string): LabelNode | undefined {
  return labels(root).find((l) => l.text.startsWith(prefix));
}

function mkBuilding(overrides: Partial<BuildingSnapshot> = {}): BuildingSnapshot {
  return {
    type: "bakery", x: 10, y: 12, w: 2, h: 2,
    connected: true, outputBuffer: 0, workerCount: 1, occupancy: 1,
    ownerId: 0, onFire: false, burning: false, level: 1,
    lacksFaith: true, lacksSafety: true, lacksGoods: true, mood: 40, wellServed: false,
    ...overrides,
  };
}

describe("createInspectPanel — producer (bakery)", () => {
  it("binds name, description, production rate, flow, workers, level, connected", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState());
    const t = texts(panel.root);
    expect(t).toContain("Bakery");
    expect(find(panel.root, "Bakes flour into bread")).toBeDefined();
    // 1 flour → 3 bread/cycle × 2 cycles/day = 2 flour/day → 6 bread/day (rate is per DAY).
    expect(find(panel.root, "Rate:")?.text).toBe("Rate: 2 flour → 6 bread/day");
    expect(find(panel.root, "Flow:")?.text).toBe("Flow: Flour → Bread");
    expect(find(panel.root, "Workers:")?.text).toBe("Workers: 1/1");
    expect(find(panel.root, "Level")?.text).toBe("Level 1");
    expect(find(panel.root, "Connected:")?.text).toBe("Connected: yes");
  });

  it("shows a 'slowed' note (never 'stopped') when unstaffed", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ workerCount: 0 }));
    const note = labels(panel.root).find((l) => l.text.startsWith("Slowed"));
    expect(note?.text).toBe("Slowed — needs a worker");
    expect(texts(panel.root).some((s) => /stopped/i.test(s))).toBe(false);
  });

  it("shows a 'slowed' note when disconnected from the road network", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ connected: false }));
    expect(find(panel.root, "Slowed")?.text).toBe("Slowed — not on a road");
  });

  it("shows a 'slowed' note when the output buffer is at cap (bakery cap = 3×5 = 15)", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ outputBuffer: 15 }));
    expect(find(panel.root, "Slowed")?.text).toBe("Slowed — output buffer full");
    // Below cap → no note.
    panel.refresh(baseState({ outputBuffer: 14 }));
    expect(find(panel.root, "Slowed")).toBeUndefined();
  });

  it("re-binds live fields when a different building / level is selected", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState());
    expect(find(panel.root, "Level")?.text).toBe("Level 1");
    // Phase H made farm single-slot (workerSlots 2→1); a staffed farm reads 1/1.
    panel.refresh(baseState({ type: "farm", level: 2, season: "summer", workerCount: 1 }));
    expect(texts(panel.root)).toContain("Farm");
    expect(find(panel.root, "Level")?.text).toBe("Level 2");
    expect(find(panel.root, "Workers:")?.text).toBe("Workers: 1/1");
  });

  it("reports content-changed for layout gating (first frame, then only on change)", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    expect(panel.refresh(baseState())).toBe(true); // first frame always lays out
    expect(panel.refresh(baseState())).toBe(false); // identical → no change
    expect(panel.refresh(baseState({ level: 2 }))).toBe(true); // label text changed
  });
});

describe("createInspectPanel — service (chapel)", () => {
  it("shows coverage radius and no production rate, no workers issue when staffed", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ type: "chapel", workerCount: 1 }));
    expect(texts(panel.root)).toContain("Chapel");
    expect(find(panel.root, "Rate:")?.text).toBe("Rate: —"); // services produce no goods
    expect(find(panel.root, "Coverage radius:")).toBeDefined();
    expect(find(panel.root, "Workers:")?.text).toBe("Workers: 1/1");
    // A service is not a goods producer → never the throttle "slowed" note even if unstaffed.
    panel.refresh(baseState({ type: "chapel", workerCount: 0 }));
    expect(find(panel.root, "Slowed")).toBeUndefined();
  });
});

describe("createInspectPanel — tradingpost (worker building, NOT a coverage service)", () => {
  it("shows trade-access scope (no bogus radius) and a workers row, no production rate", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ type: "tradingpost", workerCount: 1 }));
    expect(texts(panel.root)).toContain("Tradingpost");
    expect(find(panel.root, "Rate:")?.text).toBe("Rate: —");
    expect(find(panel.root, "Scope: trade access")).toBeDefined();
    // No coverage-radius line for the trading post.
    expect(find(panel.root, "Coverage radius:")).toBeUndefined();
    expect(find(panel.root, "Workers:")?.text).toBe("Workers: 1/1");
  });
});

describe("createInspectPanel — trade offers (Phase G, cozy decision #8)", () => {
  const offers: BarterOffer[] = [
    { give: "wood", giveQty: 5, receive: "tools", receiveQty: 1 },
    { give: "grain", giveQty: 8, receive: "bread", receiveQty: 3 },
  ];

  it("shows no trade offer buttons when traderPresent is false, even for a tradingpost", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ type: "tradingpost", traderPresent: false, traderOffers: offers }));
    expect(find(panel.root, "Trade:")).toBeUndefined();
    expect(buttons(panel.root).some((b) => b.label.includes("→"))).toBe(false);
  });

  it("shows no trade offer buttons for a non-tradingpost building even when traderPresent is true", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ type: "bakery", traderPresent: true, traderOffers: offers }));
    expect(find(panel.root, "Trade:")).toBeUndefined();
  });

  it("shows one button per live offer (≤3) with a 'Trade:' heading when staffed+connected", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ type: "tradingpost", traderPresent: true, traderOffers: offers }));
    expect(find(panel.root, "Trade:")).toBeDefined();
    const offerBtns = buttons(panel.root).filter((b) => b.label.includes("→"));
    expect(offerBtns.map((b) => b.label)).toEqual([
      "5 wood → 1 tools",
      "8 grain → 3 bread",
    ]);
  });

  it("activating an offer button sends its CONTENT, not its position (brief 97/21)", () => {
    let traded: { give: string; giveQty: number; receive: string; receiveQty: number } | undefined;
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: (o) => { traded = o; } });
    panel.refresh(baseState({ type: "tradingpost", traderPresent: true, traderOffers: offers }));
    const offerBtns = buttons(panel.root).filter((b) => b.label.includes("→"));
    offerBtns[1]?.onActivate?.();
    expect(traded).toEqual({ give: "grain", giveQty: 8, receive: "bread", receiveQty: 3 });
  });

  it("activating an offer button reads the CURRENT offer at click time, not the one bound when the button was created (re-roll race)", () => {
    const traded: { give: string; giveQty: number; receive: string; receiveQty: number }[] = [];
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: (o) => { traded.push(o); } });
    panel.refresh(baseState({ type: "tradingpost", traderPresent: true, traderOffers: offers }));
    // The menu re-rolls (a later refresh with different content at the SAME slot 0).
    const rerolled: BarterOffer[] = [{ give: "stone", giveQty: 4, receive: "planks", receiveQty: 2 }];
    panel.refresh(baseState({ type: "tradingpost", traderPresent: true, traderOffers: rerolled }));
    const offerBtns = buttons(panel.root).filter((b) => b.label.includes("→"));
    offerBtns[0]?.onActivate?.();
    expect(traded).toEqual([{ give: "stone", giveQty: 4, receive: "planks", receiveQty: 2 }]);
  });

  it("hides the trade section again once traderPresent flips back to false", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ type: "tradingpost", traderPresent: true, traderOffers: offers }));
    expect(buttons(panel.root).filter((b) => b.label.includes("→"))).toHaveLength(2);
    panel.refresh(baseState({ type: "tradingpost", traderPresent: false, traderOffers: offers }));
    expect(buttons(panel.root).filter((b) => b.label.includes("→"))).toHaveLength(0);
    expect(find(panel.root, "Trade:")).toBeUndefined();
  });

  it("reports content-changed when the trade section appears/disappears", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ type: "tradingpost", traderPresent: false, traderOffers: offers }));
    expect(panel.refresh(baseState({ type: "tradingpost", traderPresent: true, traderOffers: offers }))).toBe(true);
    expect(panel.refresh(baseState({ type: "tradingpost", traderPresent: true, traderOffers: offers }))).toBe(false);
  });
});

describe("createInspectPanel — close affordance", () => {
  it("exposes a ✕ button wired to close()", () => {
    let closed = 0;
    const panel = createInspectPanel({ close: () => { closed += 1; }, upgrade: () => {}, trade: () => {} });
    const closeBtn = buttons(panel.root).find((b) => b.label === "✕");
    expect(closeBtn).toBeDefined();
    closeBtn?.onActivate?.();
    expect(closed).toBe(1);
  });

  it("mounts the Upgrade button + cost label in the footer box (last child)", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    const footer = panel.root.children[panel.root.children.length - 1]!;
    expect(footer.kind).toBe("box");
    // The footer now holds the Upgrade button + cost label (Chunk 3).
    expect(footer.children.some((c) => c.kind === "button")).toBe(true);
    expect(footer.children.some((c) => c.kind === "label")).toBe(true);
  });
});

describe("createInspectPanel — upgrade footer (Chunk 3)", () => {
  it("shows the next-level cost for a level-1 building (L1→L2 = 4 planks, 4 stone)", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ level: 1 }));
    const cost = find(panel.root, "Cost:");
    expect(cost?.text).toBe("Cost: 4 planks, 4 stone");
    // Affordable → button enabled (not disabled).
    const upgradeBtn = buttons(panel.root).find((b) => b.label === "Upgrade");
    expect(upgradeBtn?.state).not.toBe("disabled");
  });

  it("disables the button and shows 'Max level' at level 3", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ level: 3 }));
    expect(find(panel.root, "Max level")).toBeDefined();
    expect(find(panel.root, "Cost:")).toBeUndefined();
    const upgradeBtn = buttons(panel.root).find((b) => b.label === "Upgrade");
    expect(upgradeBtn?.state).toBe("disabled");
  });

  it("disables the button and flags it when the cost is unaffordable", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    // L1→L2 needs 4 planks + 4 stone; only 1 stone on hand.
    panel.refresh(baseState({ level: 1, stockpiles: { planks: 10, stone: 1 } }));
    const cost = find(panel.root, "Cost:");
    expect(cost?.text).toContain("can't afford");
    expect(cost?.color).toBe(EDG.red);
    const upgradeBtn = buttons(panel.root).find((b) => b.label === "Upgrade");
    expect(upgradeBtn?.state).toBe("disabled");
  });

  it("enables + activates the upgrade command path when affordable and below max", () => {
    let upgraded = 0;
    const panel = createInspectPanel({ close: () => {}, upgrade: () => { upgraded += 1; }, trade: () => {} });
    panel.refresh(baseState({ level: 2, stockpiles: { planks: 10, stone: 10, tools: 10 } }));
    // L2→L3 = 8 planks, 6 stone, 2 tools — affordable here.
    expect(find(panel.root, "Cost:")?.text).toBe("Cost: 8 planks, 6 stone, 2 tools");
    const upgradeBtn = buttons(panel.root).find((b) => b.label === "Upgrade");
    expect(upgradeBtn?.state).not.toBe("disabled");
    upgradeBtn?.onActivate?.();
    expect(upgraded).toBe(1);
  });

  it("updates cost/affordability live as stockpiles change across frames", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ level: 1, stockpiles: { planks: 4, stone: 4 } }));
    let upgradeBtn = buttons(panel.root).find((b) => b.label === "Upgrade");
    expect(upgradeBtn?.state).not.toBe("disabled");
    // Stockpiles drop below cost → button disables, cost flagged.
    panel.refresh(baseState({ level: 1, stockpiles: { planks: 0, stone: 0 } }));
    upgradeBtn = buttons(panel.root).find((b) => b.label === "Upgrade");
    expect(upgradeBtn?.state).toBe("disabled");
    expect(find(panel.root, "Cost:")?.text).toContain("can't afford");
  });
});

describe("createInspectPanel — upgrade tier gate (FIX 4)", () => {
  it("disables the button and shows 'Needs Village' when L1→L2 is tier-locked (Hamlet)", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    // Affordable, but only at Hamlet — L2 needs Village, so the tier gate wins.
    panel.refresh(baseState({ level: 1, peakTier: "Hamlet", stockpiles: { planks: 10, stone: 10 } }));
    const cost = find(panel.root, "Cost:");
    expect(cost?.text).toContain("Needs Village");
    expect(cost?.text).not.toContain("can't afford"); // tier outranks affordability
    expect(cost?.color).toBe(EDG.red);
    const upgradeBtn = buttons(panel.root).find((b) => b.label === "Upgrade");
    expect(upgradeBtn?.state).toBe("disabled");
  });

  it("disables the button and shows 'Needs Town' when L2→L3 is tier-locked (Village)", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ level: 2, peakTier: "Village", stockpiles: { planks: 10, stone: 10, tools: 10 } }));
    const cost = find(panel.root, "Cost:");
    expect(cost?.text).toContain("Needs Town");
    const upgradeBtn = buttons(panel.root).find((b) => b.label === "Upgrade");
    expect(upgradeBtn?.state).toBe("disabled");
  });

  it("enables the button at the right tier + affordable (L1→L2 at Village)", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ level: 1, peakTier: "Village", stockpiles: { planks: 10, stone: 10 } }));
    const cost = find(panel.root, "Cost:");
    expect(cost?.text).toBe("Cost: 4 planks, 4 stone"); // no "(Needs …)" / "(can't afford)"
    const upgradeBtn = buttons(panel.root).find((b) => b.label === "Upgrade");
    expect(upgradeBtn?.state).not.toBe("disabled");
  });

  it("max-level outranks the tier gate (shows 'Max level' at L3 even at Hamlet)", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    panel.refresh(baseState({ level: 3, peakTier: "Hamlet" }));
    expect(find(panel.root, "Max level")).toBeDefined();
    expect(find(panel.root, "Cost:")).toBeUndefined();
  });
});

describe("createInspectPanel — markOpened forces a layout pass (FIX 2)", () => {
  it("reports content-changed on the refresh after markOpened, even with identical state", () => {
    const panel = createInspectPanel({ close: () => {}, upgrade: () => {}, trade: () => {} });
    expect(panel.refresh(baseState())).toBe(true);  // first frame
    expect(panel.refresh(baseState())).toBe(false); // identical → no change
    // Simulate a closed→open transition on the SAME building with no state change.
    panel.markOpened();
    expect(panel.refresh(baseState())).toBe(true);  // forced layout/mirror reconcile
    expect(panel.refresh(baseState())).toBe(false); // back to gated after the open
  });
});

describe("selection — footprint hit-test + re-find by origin", () => {
  const buildings: BuildingSnapshot[] = [
    mkBuilding({ type: "bakery", x: 10, y: 12, w: 2, h: 2 }),
    mkBuilding({ type: "chapel", x: 20, y: 20, w: 1, h: 1 }),
  ];

  it("buildingAtTile returns the building whose footprint contains the tile", () => {
    expect(buildingAtTile(buildings, 10, 12)?.type).toBe("bakery"); // origin corner
    expect(buildingAtTile(buildings, 11, 13)?.type).toBe("bakery"); // inside the 2×2
    expect(buildingAtTile(buildings, 20, 20)?.type).toBe("chapel");
  });

  it("buildingAtTile returns null for empty ground (incl. just outside a footprint)", () => {
    expect(buildingAtTile(buildings, 12, 12)).toBeNull(); // x == bx + w, just past
    expect(buildingAtTile(buildings, 0, 0)).toBeNull();
  });

  it("findSelected re-finds the live snapshot by footprint origin", () => {
    const sel = { x: 10, y: 12 };
    expect(findSelected(buildings, sel)?.type).toBe("bakery");
    // Origin no longer present (demolished) → null so the host auto-closes.
    expect(findSelected([buildings[1]!], sel)).toBeNull();
  });
});
