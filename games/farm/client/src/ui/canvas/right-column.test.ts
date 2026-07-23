import { describe, it, expect } from "vitest";
import { createRightColumn } from "./right-column";
import type { RightColumnState, RightColumnExtras } from "./right-column";
import { createRelationshipMatrix } from "./relationship-matrix";
import { createWealthGraph, createWealthToggle } from "./wealth-graph";
import type { ObserverSnapshot } from "@farm/sim-core/snapshot";
import type { ButtonNode, UINode } from "@engine/ui";
import type { PanelId, PanelPrefs } from "./panel-prefs";

function makeSnapshot(): ObserverSnapshot {
  return {
    day: 1,
    season: "spring",
    weather: { condition: "sunny", multiplier: 1 },
    forecast: [],
    farmers: [],
  };
}

function makeState(overrides: Partial<RightColumnState> = {}): RightColumnState {
  return {
    observer: makeSnapshot(),
    slate: [],
    events: [],
    relationships: { farmers: [], trust: {} },
    wealthSeries: [],
    ...overrides,
  };
}

/** The docked Relations + Wealth panels the host builds and hands to the column. They share the
 *  same `prefs` as the column (their own `relations`/`wealth` ids). */
function makeExtras(prefs: PanelPrefs): RightColumnExtras {
  return {
    relationshipMatrix: createRelationshipMatrix(prefs),
    wealthToggle: createWealthToggle(prefs),
    wealthGraph: createWealthGraph(),
  };
}

/** A fake `PanelPrefs` — in-memory, with every `toggle` call recorded so tests can assert the
 *  button-press path reaches prefs. Panels default to whatever `defaults` says (spec default:
 *  closed, i.e. absent from `defaults`). */
function makeFakePrefs(defaults: Partial<Record<PanelId, boolean>> = {}): PanelPrefs & {
  readonly toggleCalls: PanelId[];
} {
  const state = new Map<PanelId, boolean>(Object.entries(defaults) as Array<[PanelId, boolean]>);
  const toggleCalls: PanelId[] = [];
  return {
    toggleCalls,
    isOpen(id) {
      return state.get(id) === true;
    },
    setOpen(id, open) {
      state.set(id, open);
    },
    toggle(id) {
      toggleCalls.push(id);
      const next = !(state.get(id) === true);
      state.set(id, next);
      return next;
    },
  };
}

/** The inner box that holds the three section boxes — present in `root.children` only while the
 *  master column is expanded (alongside the master tab button). */
function innerSectionsBox(col: ReturnType<typeof createRightColumn>) {
  return col.root.children.find((n) => n.kind === "box");
}

/** All section boxes' direct children, flattened — where toggle buttons and (when open) sub-panel
 *  roots live in the tree. Empty while the whole column is collapsed. */
function sectionChildren(col: ReturnType<typeof createRightColumn>) {
  const inner = innerSectionsBox(col);
  return inner ? inner.children.flatMap((sectionBox) => sectionBox.children) : [];
}

function toggleButtons(col: ReturnType<typeof createRightColumn>): ButtonNode[] {
  return sectionChildren(col).filter((n): n is ButtonNode => n.kind === "button");
}

/** The master collapse/expand tab — always `root.children[0]`. */
function masterButton(col: ReturnType<typeof createRightColumn>): ButtonNode {
  return col.root.children[0] as ButtonNode;
}

describe("createRightColumn", () => {
  it("defaults collapsed: root shows ONLY the master tab, no sub-sections", () => {
    const prefs = makeFakePrefs();
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));

    expect(col.root.children.length).toBe(1);
    expect(masterButton(col).label).toBe("+ Panels");
    expect(innerSectionsBox(col)).toBeUndefined();
    expect(sectionChildren(col)).toEqual([]);
  });

  it("pressing the master tab flips the 'column' pref and reveals the section toggles", () => {
    const prefs = makeFakePrefs();
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));

    masterButton(col).onActivate!();

    expect(prefs.toggleCalls).toContain("column");
    expect(masterButton(col).label).toBe("- Panels");
    expect(toggleButtons(col).map((b) => b.label)).toEqual(["Farmers", "Shop", "Activity", "Relations"]);
  });

  it("with the column expanded, sections still default closed: toggles present, sub-panel roots absent", () => {
    const prefs = makeFakePrefs({ column: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));

    const descendants = sectionChildren(col);
    expect(descendants).not.toContain(col.observerPanel.root);
    expect(descendants).not.toContain(col.slateBillboard.root);
    expect(descendants).not.toContain(col.eventFeed.root);
    expect(toggleButtons(col).map((b) => b.label)).toEqual(["Farmers", "Shop", "Activity", "Relations"]);
  });

  it("toggleSection('slate') (column expanded) makes the slate panel's root appear in the tree", () => {
    const prefs = makeFakePrefs({ column: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));

    col.toggleSection("slate");

    expect(sectionChildren(col)).toContain(col.slateBillboard.root);
  });

  it("refresh() returns true right after ANY toggle even when sub-panel content is unchanged", () => {
    const prefs = makeFakePrefs({ column: true, observer: true, slate: true, events: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));

    col.refresh(makeState()); // spend each sub-panel's own "first refresh" changed flag
    expect(col.refresh(makeState())).toBe(false); // settled: nothing changed anywhere

    col.toggleSection("slate"); // closes slate; no sub-panel content touched
    expect(col.refresh(makeState())).toBe(true); // purely from the structure-dirty flag
    expect(col.refresh(makeState())).toBe(false); // dirty flag consumed
  });

  it("while collapsed, refresh does NOT fan out to sub-panels and stays false when settled", () => {
    const prefs = makeFakePrefs({ observer: true, slate: true, events: true }); // sections open, column CLOSED
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));

    // Even on the very first call — the sub-panels aren't in the tree, so their first-refresh
    // changed flags are never spent and never reported.
    expect(col.refresh(makeState())).toBe(false);

    // Expanding the column is a structural change → next refresh reports true once.
    masterButton(col).onActivate!();
    expect(col.refresh(makeState())).toBe(true);
  });

  it("pressing a section toggle button flips prefs via prefs.toggle and restructures the tree", () => {
    const prefs = makeFakePrefs({ column: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));

    const shopBtn = toggleButtons(col).find((b) => b.label === "Shop");
    expect(shopBtn).toBeDefined();
    shopBtn!.onActivate!();

    expect(prefs.toggleCalls).toContain("slate");
    expect(sectionChildren(col)).toContain(col.slateBillboard.root);
  });

  it("refresh fans out to every OPEN sub-panel and reports changed on first call", () => {
    const prefs = makeFakePrefs({ column: true, observer: true, slate: true, events: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));
    const changed = col.refresh(makeState());
    expect(changed).toBe(true);
  });

  it("refresh returns false once nothing layout-affecting changed anywhere (all open)", () => {
    const prefs = makeFakePrefs({ column: true, observer: true, slate: true, events: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));
    col.refresh(makeState());
    const again = col.refresh(makeState());
    expect(again).toBe(false);
  });

  it("routes a wheel event to whichever OPEN sub-panel is under the pointer", () => {
    const prefs = makeFakePrefs({ column: true, observer: true, slate: true, events: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));
    col.refresh(makeState());

    // Force known rects so hit-testing is deterministic in this unit test.
    col.observerPanel.root.rect = { x: 0, y: 0, width: 100, height: 50 };
    col.slateBillboard.root.rect = { x: 0, y: 50, width: 100, height: 50 };
    col.eventFeed.root.rect = { x: 0, y: 100, width: 100, height: 50 };

    expect(col.wheel(10, 10, 5)).toBe(true); // over observer panel
    expect(col.wheel(10, 60, 5)).toBe(true); // over slate billboard
    expect(col.wheel(10, 999, 5)).toBe(false); // over nothing
  });

  it("wheel does NOT route to a collapsed sub-panel even over its stale last-laid-out rect", () => {
    const prefs = makeFakePrefs({ column: true }); // column open, all sections closed
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));
    col.refresh(makeState());

    // Simulate a rect left over from before the panel collapsed (containsPoint alone would hit).
    col.slateBillboard.root.rect = { x: 0, y: 50, width: 100, height: 50 };

    expect(col.wheel(10, 60, 5)).toBe(false);
  });

  it("wheel does NOT route while the WHOLE column is collapsed, even over an open section's rect", () => {
    const prefs = makeFakePrefs({ slate: true }); // slate 'open' but column CLOSED
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));
    col.refresh(makeState());

    col.slateBillboard.root.rect = { x: 0, y: 50, width: 100, height: 50 };

    expect(col.wheel(10, 60, 5)).toBe(false);
  });

  it("wheel still routes to an OPEN sub-panel under the pointer (column expanded)", () => {
    const prefs = makeFakePrefs({ column: true, slate: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, makeExtras(prefs));
    col.refresh(makeState());

    col.slateBillboard.root.rect = { x: 0, y: 50, width: 100, height: 50 };

    expect(col.wheel(10, 60, 5)).toBe(true);
  });

  // --- Docked Relations + Wealth (moved out of the floating bottom-left panels) ---

  it("docks the relationship matrix + wealth toggle into the expanded column", () => {
    const prefs = makeFakePrefs({ column: true });
    const extras = makeExtras(prefs);
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, extras);

    const inner = innerSectionsBox(col);
    expect(inner).toBeDefined();
    // The matrix root sits directly in the sections stack (it carries its own Relations toggle);
    // the wealth toggle's root lives inside the wealth section box.
    expect(inner!.children).toContain(extras.relationshipMatrix.root);
    const wealthSection = inner!.children.find((c) => (c.children as UINode[]).includes(extras.wealthToggle.root));
    expect(wealthSection).toBeDefined();
  });

  it("shows the wealth chart in the wealth section only while the wealth toggle is open", () => {
    const prefs = makeFakePrefs({ column: true, wealth: true });
    const extras = makeExtras(prefs);
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, extras);
    col.refresh(makeState());

    const inner = innerSectionsBox(col)!;
    const wealthSection = inner.children.find((c) => (c.children as UINode[]).includes(extras.wealthToggle.root))!;
    expect(wealthSection.children).toContain(extras.wealthGraph.root);
  });

  it("refresh reports changed right after the wealth toggle flips (G hotkey / button)", () => {
    const prefs = makeFakePrefs({ column: true });
    const extras = makeExtras(prefs);
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs, extras);
    col.refresh(makeState());
    expect(col.refresh(makeState())).toBe(false); // settled

    extras.wealthToggle.toggleOpen(); // as the G hotkey would
    expect(col.refresh(makeState())).toBe(true); // toggle picked up
    // ...and the chart is now docked in the wealth section.
    const inner = innerSectionsBox(col)!;
    const wealthSection = inner.children.find((c) => (c.children as UINode[]).includes(extras.wealthToggle.root))!;
    expect(wealthSection.children).toContain(extras.wealthGraph.root);
  });

});
