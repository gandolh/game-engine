/**
 * Farm Valley right column — composes the observer panel, slate billboard, and event feed into
 * ONE stacked container root, rendered IN-CANVAS via `@engine/ui`.
 *
 * Ports the old DOM `ui/right-column.ts` (`createRightColumn`, a bare positioned wrapper `<div>`)
 * — the three panels it hosted are now themselves `@engine/ui` trees
 * ({@link createObserverPanel}, {@link createSlateBillboard}, {@link createEventFeed}), so this
 * module stacks their roots in one `box` (matching the old wrapper's one-element contract, so the
 * integration chunk registers a SINGLE root for the whole column instead of three independent
 * roots) — AND, per brief 117, each sub-panel collapses independently behind an ALWAYS-VISIBLE
 * toggle `button()` (labels "Farmers" / "Shop" / "Activity"), so this module also owns the
 * collapse/expand structure, not just composition.
 *
 * On top of the per-section toggles, the WHOLE column sits behind ONE master collapse (`masterBtn`,
 * persisted under the `"column"` `PanelId`, default CLOSED): collapsed, `root` holds just that one
 * tab so the column shrinks to a small button parked at the screen's right edge; expanded, `root`
 * shows the tab plus the three sub-sections (which keep their own independent collapse). This
 * replaces three always-visible header bars with a single edge tab the player opts into.
 *
 * Each sub-panel lives in its own section `box`: `[toggleBtn]` while collapsed, or
 * `[toggleBtn, subPanelRoot]` while open — rebuilt via `children = [...]` on toggle, mirroring how
 * `relationship-matrix.ts` swaps `gridBox.children` wholesale rather than patching in place.
 * Open/closed state is delegated to the injected {@link PanelPrefs} (persistence + defaults live
 * there); this module only reads/flips it and restructures its own tree. Panels default CLOSED
 * (`PanelPrefs`'s own default).
 *
 * `refresh` only calls a sub-panel's own `refresh` while it is OPEN (a collapsed panel's content
 * refresh is wasted work and must not force layout), and ORs those results with an internal
 * `structureDirty` flag that any toggle (button press or {@link RightColumn.toggleSection}) sets —
 * so the very next `refresh()` after a toggle always reports `true` even when no sub-panel's own
 * content changed, letting the host's `computeLayout` gate see the collapse/expand.
 *
 * `wheel` routes a wheel event to whichever OPEN panel's LAST-LAID-OUT rect contains the pointer.
 * A collapsed panel is never hit-tested even if its `rect` is still sitting on stale (pre-collapse)
 * coordinates — `containsPoint` alone can't tell a real hit from a stale one, so every hit test is
 * additionally guarded by that panel's current open state. `drawIcons` forwards to the slate
 * billboard's own icon pass only while the slate section is open (same staleness concern: a
 * collapsed slate panel's rows are not part of the laid-out tree).
 *
 * This module does NOT wire the panels' actions to real host commands — the integration chunk
 * (which owns the focus-farmer command + the UI host) passes fully-formed
 * {@link ObserverPanelActions} in.
 *
 * EDG32: the toggle buttons are built via `@engine/ui`'s `button()` and left themed (no `EDG.*`
 * override) — the theme already colours button states, matching `playback-controls.ts`'s usage.
 */
import { box, button, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, UISurface } from "@engine/ui";
import type { ObserverSnapshot } from "@farm/sim-core/snapshot";
import { createObserverPanel } from "./observer-panel";
import type { ObserverPanel, ObserverPanelActions } from "./observer-panel";
import { createSlateBillboard } from "./slate-billboard";
import type { SlateBillboard, SlateEntry } from "./slate-billboard";
import { createEventFeed } from "./event-feed";
import type { EventFeed, EventFeedRow } from "./event-feed";
import type { PanelId, PanelPrefs } from "./panel-prefs";

/** The three right-column sub-panels this module can independently collapse. */
export type RightColumnSectionId = "observer" | "slate" | "events";

const SECTION_PANEL_ID: Record<RightColumnSectionId, PanelId> = {
  observer: "observer",
  slate: "slate",
  events: "events",
};

const SECTION_TOGGLE_LABEL: Record<RightColumnSectionId, string> = {
  observer: "Farmers",
  slate: "Shop",
  events: "Activity",
};

/** The latest state for all three sub-panels, supplied each frame by the host. */
export interface RightColumnState {
  observer: ObserverSnapshot;
  slate: ReadonlyArray<SlateEntry>;
  events: readonly EventFeedRow[];
}

/** The retained right column: its root node plus refresh() + wheel() + drawIcons() + collapse. */
export interface RightColumn {
  /** The SINGLE widget tree root for the whole column — register ONE root with the UI host. */
  readonly root: ContainerNode;
  /**
   * Re-bind the OPEN sub-panels from the latest state. Call once per frame. A collapsed
   * sub-panel's own `refresh` is NOT called (its content isn't visible, so re-binding it would be
   * wasted work).
   *
   * Returns `true` when ANY open sub-panel reports LAYOUT-AFFECTING content changed this call, OR
   * a section was toggled since the last `refresh` call — so the host can gate the expensive
   * `computeLayout` + a11y-mirror reconcile behind it.
   */
  refresh(state: RightColumnState): boolean;
  /**
   * Route a wheel event at screen position (`x`,`y`) to whichever OPEN sub-panel's last-laid-out
   * rect contains the pointer. No-op (and returns `false`) if the pointer is over none of them, or
   * over a panel that is currently collapsed (even if its stale rect would otherwise match).
   */
  wheel(x: number, y: number, dy: number): boolean;
  /** Forward to the slate billboard's icon pass — call AFTER `renderTree`, before `surface.end()`.
   *  No-op while the slate section is collapsed. */
  drawIcons(surface: UISurface): void;
  /** Flip one section's open/closed state in `prefs` and restructure the tree immediately (the
   *  same effect as pressing that section's toggle button). */
  toggleSection(id: RightColumnSectionId): void;
  /** The three sub-panels, for direct access (e.g. wiring a11y mounts per-panel). */
  readonly observerPanel: ObserverPanel;
  readonly slateBillboard: SlateBillboard;
  readonly eventFeed: EventFeed;
}

function containsPoint(node: ContainerNode, x: number, y: number): boolean {
  const { x: rx, y: ry, width, height } = node.rect;
  return x >= rx && x < rx + width && y >= ry && y < ry + height;
}

/** One collapsible section: a toggle button always shown, the sub-panel root shown only while open. */
interface Section {
  readonly sectionBox: ContainerNode;
  readonly toggleBtn: ButtonNode;
  /** Rebuild `sectionBox.children` from the CURRENT prefs state. */
  sync(): void;
}

/**
 * Build the retained right-column widget tree, composing the three sub-panels created from
 * `actions`, each behind an independently-collapsible section driven by `prefs`.
 */
export function createRightColumn(actions: ObserverPanelActions, prefs: PanelPrefs): RightColumn {
  const observerPanel = createObserverPanel(actions);
  const slateBillboard = createSlateBillboard();
  const eventFeed = createEventFeed();

  const panelRootFor: Record<RightColumnSectionId, ContainerNode> = {
    observer: observerPanel.root,
    slate: slateBillboard.root,
    events: eventFeed.root,
  };

  /** Set by any toggle (button press or `toggleSection`); consumed and reset by the next
   *  `refresh` so the host's `computeLayout` gate sees `true` even when no sub-panel's own
   *  content changed. */
  let structureDirty = false;

  function isOpen(id: RightColumnSectionId): boolean {
    return prefs.isOpen(SECTION_PANEL_ID[id]);
  }

  function makeSection(id: RightColumnSectionId): Section {
    const panelRoot = panelRootFor[id];
    const toggleBtn = button(SECTION_TOGGLE_LABEL[id], {
      onActivate: () => {
        prefs.toggle(SECTION_PANEL_ID[id]);
        section.sync();
        structureDirty = true;
      },
    });
    const sectionBox = box({ direction: "column", gap: 0, align: "stretch" }, [toggleBtn]);
    const section: Section = {
      sectionBox,
      toggleBtn,
      sync(): void {
        sectionBox.children = isOpen(id) ? [toggleBtn, panelRoot] : [toggleBtn];
      },
    };
    section.sync();
    return section;
  }

  const sections: Record<RightColumnSectionId, Section> = {
    observer: makeSection("observer"),
    slate: makeSection("slate"),
    events: makeSection("events"),
  };

  // The three sub-sections live in their own inner box; the outer `root` shows it only while the
  // WHOLE column is expanded (the master collapse, added per user request: one edge tab instead of
  // three always-visible header bars). Collapsed, `root` holds JUST `masterBtn`, so it shrinks to a
  // single small tab that the host's right-edge anchor parks against the screen edge.
  //
  // `gap: 0` so the section tabs sit FLUSH — with the enclosing background panel (`root` below) the
  // world no longer shows through inter-tab gaps; the sections read as one continuous boxed panel.
  const sectionsBox = box({ direction: "column", gap: 0, align: "stretch" }, [
    sections.observer.sectionBox,
    sections.slate.sectionBox,
    sections.events.sectionBox,
  ]);

  const MASTER_ID: PanelId = "column";
  function masterOpen(): boolean {
    return prefs.isOpen(MASTER_ID);
  }
  // ASCII markers only — the `@engine/ui` fonts cover printable ASCII, so `▸/▾` would render as `?`.
  function masterLabel(): string {
    return masterOpen() ? "- Panels" : "+ Panels";
  }
  const masterBtn = button(masterLabel(), {
    onActivate: () => {
      prefs.toggle(MASTER_ID);
      syncMaster();
      structureDirty = true;
    },
  });

  // The whole column is ONE enclosing box: a `panel()` (background + border) rather than a bare
  // `box`, so the master tab and the sub-sections sit inside a single framed container. A container
  // sizes to its children, so the content can never exceed this box — the box IS its content's
  // bounds. `gap: 0` keeps the tab/sub-panel stack flush against that frame.
  const root = panel({ direction: "column", gap: 0, align: "stretch", padding: 0 }, []);

  function syncMaster(): void {
    masterBtn.label = masterLabel();
    root.children = masterOpen() ? [masterBtn, sectionsBox] : [masterBtn];
  }
  syncMaster();

  function toggleSection(id: RightColumnSectionId): void {
    prefs.toggle(SECTION_PANEL_ID[id]);
    sections[id].sync();
    structureDirty = true;
  }

  function refresh(state: RightColumnState): boolean {
    const dirty = structureDirty;
    structureDirty = false;

    // While the whole column is collapsed, its sub-panels aren't in the tree — refreshing them
    // would be wasted work (they re-sync on expand). Only the master tab is laid out.
    if (!masterOpen()) return dirty;

    const a = isOpen("observer") ? observerPanel.refresh(state.observer) : false;
    const b = isOpen("slate") ? slateBillboard.refresh(state.slate) : false;
    const c = isOpen("events") ? eventFeed.refresh(state.events) : false;
    return dirty || a || b || c;
  }

  function wheel(x: number, y: number, dy: number): boolean {
    if (!masterOpen()) return false;
    if (isOpen("observer") && containsPoint(observerPanel.root, x, y)) {
      observerPanel.wheel(dy);
      return true;
    }
    if (isOpen("slate") && containsPoint(slateBillboard.root, x, y)) {
      slateBillboard.wheel(dy);
      return true;
    }
    if (isOpen("events") && containsPoint(eventFeed.root, x, y)) {
      eventFeed.wheel(dy);
      return true;
    }
    return false;
  }

  function drawIcons(surface: UISurface): void {
    if (masterOpen() && isOpen("slate")) slateBillboard.drawIcons(surface);
  }

  return {
    root,
    refresh,
    wheel,
    drawIcons,
    toggleSection,
    observerPanel,
    slateBillboard,
    eventFeed,
  };
}
