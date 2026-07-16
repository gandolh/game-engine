import { describe, it, expect } from "vitest";
import type { ButtonNode } from "@engine/ui";
import { createStatusPanel } from "./status-panel";
import type { SiegeHudState } from "../ui/siege-hud";
import type { PanelId, PanelPrefs } from "./panel-prefs";

function baseState(overrides: Partial<SiegeHudState> = {}): SiegeHudState {
  return {
    threatLevel: 0,
    nextRaidDay: -1,
    defensiveStrength: 0,
    keepPresent: false,
    keepSacked: false,
    activeFires: 0,
    outbreakActive: false,
    sickVillagers: 0,
    modeText: "Mode: None",
    ...overrides,
  };
}

/** A fake `PanelPrefs` — in-memory, with every `toggle` call recorded so tests can assert the
 *  button-press path reaches prefs. Defaults to whatever `defaults` says (spec default for
 *  "status": open — see panel-prefs.ts's PANEL_DEFAULTS). */
function makeFakePrefs(defaults: Partial<Record<PanelId, boolean>> = { status: true }): PanelPrefs & {
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

function toggleButton(root: ReturnType<typeof createStatusPanel>["root"]): ButtonNode {
  const btn = root.children.find((n): n is ButtonNode => n.kind === "button");
  if (btn === undefined) throw new Error("expected a toggle button in the status panel's children");
  return btn;
}

describe("createStatusPanel", () => {
  it("open by default (per PANEL_DEFAULTS): the toggle button AND the inner siege HUD root are both present", () => {
    const prefs = makeFakePrefs();
    const panel = createStatusPanel(prefs);
    expect(panel.root.children.length).toBe(2);
    expect(toggleButton(panel.root).label).toBe("Status");
  });

  it("closed: only the toggle button is present, the inner siege HUD root is absent", () => {
    const prefs = makeFakePrefs({ status: false });
    const panel = createStatusPanel(prefs);
    expect(panel.root.children.length).toBe(1);
    expect(panel.root.children[0]?.kind).toBe("button");
  });

  it("pressing the toggle button flips prefs and restructures the tree", () => {
    const prefs = makeFakePrefs({ status: true });
    const panel = createStatusPanel(prefs);
    expect(panel.root.children.length).toBe(2);

    toggleButton(panel.root).onActivate?.();
    expect(prefs.toggleCalls).toEqual(["status"]);
    expect(prefs.isOpen("status")).toBe(false);
    expect(panel.root.children.length).toBe(1); // collapsed: body dropped from the tree

    toggleButton(panel.root).onActivate?.();
    expect(panel.root.children.length).toBe(2); // reopened: body back in the tree
  });

  it("refresh() reports true on the very first call while open (matches SiegeHud's firstRefresh contract)", () => {
    const prefs = makeFakePrefs({ status: true });
    const panel = createStatusPanel(prefs);
    expect(panel.refresh(baseState())).toBe(true);
    expect(panel.refresh(baseState())).toBe(false); // identical state, no toggle -> no change
  });

  it("refresh() while collapsed never calls into the inner HUD, so it reports unchanged (no toggle since construction)", () => {
    const prefs = makeFakePrefs({ status: false });
    const panel = createStatusPanel(prefs);
    // No toggle happened yet, so structureDirty is false; the inner HUD is never refreshed while
    // closed, so there's nothing to report as content-changed either.
    expect(panel.refresh(baseState())).toBe(false);
    expect(panel.refresh(baseState({ threatLevel: 90 }))).toBe(false);
  });

  it("a toggle forces refresh() to report true on the very next call, even with unchanged state", () => {
    const prefs = makeFakePrefs({ status: true });
    const panel = createStatusPanel(prefs);
    panel.refresh(baseState()); // consume the initial firstRefresh=true

    toggleButton(panel.root).onActivate?.(); // collapse
    expect(panel.refresh(baseState())).toBe(true); // structureDirty, even though nothing else changed
    expect(panel.refresh(baseState())).toBe(false); // consumed; collapsed + no further change
  });

  it("reopening re-binds the inner HUD's content (its own firstRefresh fires again is NOT required, but the text must be current)", () => {
    const prefs = makeFakePrefs({ status: true });
    const panel = createStatusPanel(prefs);
    panel.refresh(baseState({ threatLevel: 5 }));

    toggleButton(panel.root).onActivate?.(); // collapse
    panel.refresh(baseState({ threatLevel: 70 })); // ignored while collapsed
    toggleButton(panel.root).onActivate?.(); // reopen
    panel.refresh(baseState({ threatLevel: 70 })); // now bound while open

    const inner = panel.root.children.find((n) => n.kind !== "button");
    expect(inner).toBeDefined();
  });
});
