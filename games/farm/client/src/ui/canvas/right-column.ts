/**
 * Farm Valley right column — composes the observer panel, slate billboard, and event feed into
 * ONE stacked container root, rendered IN-CANVAS via `@engine/ui`.
 *
 * Ports the old DOM `ui/right-column.ts` (`createRightColumn`, a bare positioned wrapper `<div>`)
 * — the three panels it hosted are now themselves `@engine/ui` trees
 * ({@link createObserverPanel}, {@link createSlateBillboard}, {@link createEventFeed}), so this
 * module's job is purely composition: stack their roots in one `box` so the integration chunk can
 * register a SINGLE root for the whole column (matching the old wrapper's one-element contract),
 * instead of three independent roots.
 *
 * `refresh` fans out to each panel's own `refresh` and ORs their "layout changed" results; `wheel`
 * routes a wheel event to whichever panel's LAST-LAID-OUT rect contains the pointer (mirrors the
 * DOM version's independent per-panel `overflow-y: auto` scroll regions, now resolved by hit
 * position instead of the browser's native scroll containers). `drawIcons` forwards to the slate
 * billboard's own icon pass (the only sub-panel with one).
 *
 * This module does NOT wire the panels' actions to real host commands — the integration chunk
 * (which owns the focus-farmer command + the UI host) passes fully-formed
 * {@link ObserverPanelActions} in.
 *
 * EDG32: this module emits no colours itself — it only composes; each sub-panel owns its palette.
 */
import { box } from "@engine/ui";
import type { ContainerNode, UISurface } from "@engine/ui";
import type { ObserverSnapshot } from "@farm/sim-core/snapshot";
import { createObserverPanel } from "./observer-panel";
import type { ObserverPanel, ObserverPanelActions } from "./observer-panel";
import { createSlateBillboard } from "./slate-billboard";
import type { SlateBillboard, SlateEntry } from "./slate-billboard";
import { createEventFeed } from "./event-feed";
import type { EventFeed, EventFeedRow } from "./event-feed";

/** The latest state for all three sub-panels, supplied each frame by the host. */
export interface RightColumnState {
  observer: ObserverSnapshot;
  slate: ReadonlyArray<SlateEntry>;
  events: readonly EventFeedRow[];
}

/** The retained right column: its root node plus refresh() + wheel() + drawIcons(). */
export interface RightColumn {
  /** The SINGLE widget tree root for the whole column — register ONE root with the UI host. */
  readonly root: ContainerNode;
  /**
   * Re-bind all three sub-panels from the latest state. Call once per frame.
   *
   * Returns `true` when ANY sub-panel reports LAYOUT-AFFECTING content changed this call, so the
   * host can gate the expensive `computeLayout` + a11y-mirror reconcile behind it.
   */
  refresh(state: RightColumnState): boolean;
  /**
   * Route a wheel event at screen position (`x`,`y`) to whichever sub-panel's last-laid-out rect
   * contains the pointer. No-op (and returns `false`) if the pointer is over none of them.
   */
  wheel(x: number, y: number, dy: number): boolean;
  /** Forward to the slate billboard's icon pass — call AFTER `renderTree`, before `surface.end()`. */
  drawIcons(surface: UISurface): void;
  /** The three sub-panels, for direct access (e.g. wiring a11y mounts per-panel). */
  readonly observerPanel: ObserverPanel;
  readonly slateBillboard: SlateBillboard;
  readonly eventFeed: EventFeed;
}

function containsPoint(node: ContainerNode, x: number, y: number): boolean {
  const { x: rx, y: ry, width, height } = node.rect;
  return x >= rx && x < rx + width && y >= ry && y < ry + height;
}

/**
 * Build the retained right-column widget tree, composing the three sub-panels created from
 * `actions`. The tree is created once; `refresh` fans out to each sub-panel's own `refresh`.
 */
export function createRightColumn(actions: ObserverPanelActions): RightColumn {
  const observerPanel = createObserverPanel(actions);
  const slateBillboard = createSlateBillboard();
  const eventFeed = createEventFeed();

  const root = box({ direction: "column", gap: 8, align: "stretch" }, [
    observerPanel.root,
    slateBillboard.root,
    eventFeed.root,
  ]);

  function refresh(state: RightColumnState): boolean {
    const a = observerPanel.refresh(state.observer);
    const b = slateBillboard.refresh(state.slate);
    const c = eventFeed.refresh(state.events);
    return a || b || c;
  }

  function wheel(x: number, y: number, dy: number): boolean {
    if (containsPoint(observerPanel.root, x, y)) {
      observerPanel.wheel(dy);
      return true;
    }
    if (containsPoint(slateBillboard.root, x, y)) {
      slateBillboard.wheel(dy);
      return true;
    }
    if (containsPoint(eventFeed.root, x, y)) {
      eventFeed.wheel(dy);
      return true;
    }
    return false;
  }

  function drawIcons(surface: UISurface): void {
    slateBillboard.drawIcons(surface);
  }

  return { root, refresh, wheel, drawIcons, observerPanel, slateBillboard, eventFeed };
}
