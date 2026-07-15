import { describe, it, expect } from "vitest";
import { createRightColumn } from "./right-column";
import type { RightColumnState } from "./right-column";
import type { ObserverSnapshot } from "@farm/sim-core/snapshot";
import type { ButtonNode } from "@engine/ui";
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
    ...overrides,
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

/** All section boxes' direct children, flattened — where toggle buttons and (when open) sub-panel
 *  roots live in the tree. */
function sectionChildren(col: ReturnType<typeof createRightColumn>) {
  return col.root.children.flatMap((sectionBox) => sectionBox.children);
}

function toggleButtons(col: ReturnType<typeof createRightColumn>): ButtonNode[] {
  return sectionChildren(col).filter((n): n is ButtonNode => n.kind === "button");
}

describe("createRightColumn", () => {
  it("defaults every section closed: sub-panel roots absent, toggle buttons present top-to-bottom", () => {
    const prefs = makeFakePrefs();
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);

    expect(col.root.children.length).toBe(3);

    const descendants = sectionChildren(col);
    expect(descendants).not.toContain(col.observerPanel.root);
    expect(descendants).not.toContain(col.slateBillboard.root);
    expect(descendants).not.toContain(col.eventFeed.root);

    expect(toggleButtons(col).map((b) => b.label)).toEqual(["Farmers", "Shop", "Activity"]);
  });

  it("toggleSection('slate') makes the slate panel's root appear in the tree", () => {
    const prefs = makeFakePrefs();
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);

    col.toggleSection("slate");

    expect(sectionChildren(col)).toContain(col.slateBillboard.root);
  });

  it("refresh() returns true right after ANY toggle even when sub-panel content is unchanged", () => {
    const prefs = makeFakePrefs({ observer: true, slate: true, events: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);

    col.refresh(makeState()); // spend each sub-panel's own "first refresh" changed flag
    expect(col.refresh(makeState())).toBe(false); // settled: nothing changed anywhere

    col.toggleSection("slate"); // closes slate; no sub-panel content touched
    expect(col.refresh(makeState())).toBe(true); // purely from the structure-dirty flag
    expect(col.refresh(makeState())).toBe(false); // dirty flag consumed
  });

  it("pressing a toggle button flips prefs via prefs.toggle and restructures the tree", () => {
    const prefs = makeFakePrefs();
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);

    const shopBtn = toggleButtons(col).find((b) => b.label === "Shop");
    expect(shopBtn).toBeDefined();
    shopBtn!.onActivate!();

    expect(prefs.toggleCalls).toContain("slate");
    expect(sectionChildren(col)).toContain(col.slateBillboard.root);
  });

  it("refresh fans out to every OPEN sub-panel and reports changed on first call", () => {
    const prefs = makeFakePrefs({ observer: true, slate: true, events: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);
    const changed = col.refresh(makeState());
    expect(changed).toBe(true);
  });

  it("refresh returns false once nothing layout-affecting changed anywhere (all open)", () => {
    const prefs = makeFakePrefs({ observer: true, slate: true, events: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);
    col.refresh(makeState());
    const again = col.refresh(makeState());
    expect(again).toBe(false);
  });

  it("routes a wheel event to whichever OPEN sub-panel is under the pointer", () => {
    const prefs = makeFakePrefs({ observer: true, slate: true, events: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);
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
    const prefs = makeFakePrefs(); // all closed
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);
    col.refresh(makeState());

    // Simulate a rect left over from before the panel collapsed (containsPoint alone would hit).
    col.slateBillboard.root.rect = { x: 0, y: 50, width: 100, height: 50 };

    expect(col.wheel(10, 60, 5)).toBe(false);
  });

  it("wheel still routes to an OPEN sub-panel under the pointer", () => {
    const prefs = makeFakePrefs({ slate: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);
    col.refresh(makeState());

    col.slateBillboard.root.rect = { x: 0, y: 50, width: 100, height: 50 };

    expect(col.wheel(10, 60, 5)).toBe(true);
  });

  it("drawIcons does not throw (slate open)", () => {
    const prefs = makeFakePrefs({ slate: true });
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);
    col.refresh(makeState());
    const surface = {
      begin: () => {},
      push: () => {},
      rect: () => {},
      sprite: () => {},
      end: () => {},
    };
    expect(() => col.drawIcons(surface as unknown as Parameters<typeof col.drawIcons>[0])).not.toThrow();
  });

  it("drawIcons does not throw while slate is collapsed", () => {
    const prefs = makeFakePrefs(); // all closed
    const col = createRightColumn({ onSelectFarmer: () => {} }, prefs);
    col.refresh(makeState());
    const surface = {
      begin: () => {},
      push: () => {},
      rect: () => {},
      sprite: () => {},
      end: () => {},
    };
    expect(() => col.drawIcons(surface as unknown as Parameters<typeof col.drawIcons>[0])).not.toThrow();
  });
});
