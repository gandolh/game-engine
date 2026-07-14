/**
 * Farm Valley event feed — the scrolling activity log, rendered IN-CANVAS via `@engine/ui`.
 *
 * Ports the old DOM `ui/event-feed-panel.ts` (`EventFeedPanel`) onto the create/refresh pattern
 * established by `createResourceHud` (Citadel) / `createWorldClock` (Farm chunk 1): a retained
 * widget tree built ONCE by {@link createEventFeed}, then `refresh(rows)` re-textures lines in
 * place each frame from the latest event rows (newest first, capped at {@link EVENT_FEED_CAP}).
 *
 * ## Scrolling
 * The feed is wrapped in an `@engine/ui` scroll viewport (see `observer-panel.ts`'s module doc
 * for the general pattern): after `computeScrollContent` lays lines out in content-space,
 * `refresh` copies the CURRENTLY VISIBLE lines' nodes (translated to screen-space and clipped to
 * the viewport) into a plain `box` that becomes part of the returned tree, mirroring the scroll
 * module's own `renderScrollViewport` translate+cull math. `wheel(dy)` scrolls the feed.
 *
 * ## Drama colouring
 * Each line is a real coloured `label` (not a button — clicking a line to follow its farmer is a
 * DOM nice-to-have, not part of this chunk's acceptance bar, since a `ButtonNode` can only paint
 * ONE tint for its whole label and would lose the drama colour). High-drama events
 * (`drama >= 0.7`) render gold with a "★ " prefix (mirrors the DOM panel); otherwise green.
 *
 * EDG32-only: every colour is an `EDG.*` constant (mirrors the DOM feed's gold/green split).
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import { scroll, computeScrollContent, clampScroll, scrollBy } from "@engine/ui";
import type { ScrollViewportNode } from "@engine/ui";

/** Max rows kept/shown — mirrors the old DOM `EVENT_FEED_PANEL_CAP`. */
export const EVENT_FEED_CAP = 30;

export interface EventFeedRow {
  day: number;
  text: string;
  drama?: number;
  farmerId?: number | null;
}

/** Fixed visible height (px) of the scrollable feed. */
const FEED_HEIGHT = 220;
/** Fixed width (px) of the panel (and thus the scroll viewport) — kept in sync with
 *  `observer-panel.ts`'s `LIST_WIDTH` (see its comment); the two stack (with `slate-billboard.ts`)
 *  in `right-column.ts`'s `align: "stretch"` column, so a mismatched width here would leave this
 *  panel's content narrower than its stretched chrome. Event lines are free-text sentences that
 *  can still run past this width regardless (pre-existing, not fixed by any single wrap width). */
const FEED_WIDTH = 390;

/** The retained event feed: its root node plus refresh() + wheel(). */
export interface EventFeed {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind all lines from the latest rows (newest first). Call once per frame.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call, so the host can gate the
   * expensive `computeLayout` + a11y-mirror reconcile behind it.
   */
  refresh(rows: readonly EventFeedRow[]): boolean;
  /** Scroll the feed by `dy` px (e.g. from a mouse-wheel event over the panel). */
  wheel(dy: number): void;
}

function lineText(row: EventFeedRow): string {
  const isHighDrama = (row.drama ?? 0) >= 0.7;
  const prefix = isHighDrama ? "★ " : "";
  return `${prefix}Day ${row.day} — ${row.text}`;
}

function lineColor(row: EventFeedRow): string {
  return (row.drama ?? 0) >= 0.7 ? EDG.gold : EDG.green;
}

/**
 * Build the retained event-feed widget tree. Lines are POOLED labels (one per visible slot,
 * indexed 0..EVENT_FEED_CAP-1) reused/re-textured each `refresh` — mirrors the DOM panel's
 * grow/shrink `linesContainer.children` pool, avoiding per-frame node churn.
 */
export function createEventFeed(): EventFeed {
  const title = label("Activity", { color: EDG.white });

  const vp: ScrollViewportNode = scroll({ width: FEED_WIDTH, height: FEED_HEIGHT }, []);
  vp.rect = { x: 0, y: 0, width: FEED_WIDTH, height: FEED_HEIGHT };

  const visibleRows = box({ direction: "column", gap: 0, align: "stretch" }, []);
  visibleRows.layout = { width: FEED_WIDTH, height: FEED_HEIGHT };

  const root = panel({ direction: "column", gap: 6, align: "stretch" }, [title, visibleRows]);

  // Pool of line labels, index-keyed (line i always reuses the same node, regardless of which
  // event it currently shows) — cheap because the feed's slot count is capped and stable.
  const pool: LabelNode[] = [];

  let changed = false;
  let firstRefresh = true;

  function poolLabel(i: number): LabelNode {
    let lbl = pool[i];
    if (lbl === undefined) {
      lbl = label("", { color: EDG.green });
      pool[i] = lbl;
      changed = true;
    }
    return lbl;
  }

  function syncVisibleRows(): void {
    computeScrollContent(vp, undefined, { direction: "column", gap: 0 });
    vp.rect = { x: visibleRows.rect.x, y: visibleRows.rect.y, width: FEED_WIDTH, height: FEED_HEIGHT };
    clampScroll(vp);

    const { x: vpX, y: vpY, width: vpW, height: vpH } = vp.rect;
    const ox = vpX - vp.scrollOffset.x;
    const oy = vpY - vp.scrollOffset.y;

    const visible: LabelNode[] = [];
    for (const child of vp.children) {
      const translated = {
        x: child.rect.x + ox,
        y: child.rect.y + oy,
        width: child.rect.width,
        height: child.rect.height,
      };
      const overlaps =
        translated.x < vpX + vpW &&
        translated.x + translated.width > vpX &&
        translated.y < vpY + vpH &&
        translated.y + translated.height > vpY;
      if (!overlaps) continue;
      child.rect = translated;
      visible.push(child as LabelNode);
    }

    if (
      visibleRows.children.length !== visible.length ||
      visibleRows.children.some((c, i) => c !== visible[i])
    ) {
      changed = true;
    }
    visibleRows.children = visible;
  }

  function refresh(rows: readonly EventFeedRow[]): boolean {
    changed = false;

    const shown = rows.slice(-EVENT_FEED_CAP).reverse();

    shown.forEach((row, i) => {
      const lbl = poolLabel(i);
      const text = lineText(row);
      if (lbl.text !== text) {
        lbl.text = text;
        changed = true;
      }
      lbl.color = lineColor(row);
    });

    const nextChildren = shown.map((_, i) => pool[i]!);
    if (vp.children.length !== nextChildren.length || vp.children.some((c, i) => c !== nextChildren[i])) {
      vp.children = nextChildren;
      changed = true;
    }

    syncVisibleRows();

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  function wheel(dy: number): void {
    scrollBy(vp, 0, dy);
    syncVisibleRows();
  }

  return { root, refresh, wheel };
}
