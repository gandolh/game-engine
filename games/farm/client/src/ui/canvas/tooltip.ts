/**
 * Farm Valley hover tooltip — the small floating label+description box that follows the
 * cursor over a hovered sprite, rendered IN-CANVAS via `@engine/ui`.
 *
 * Ports the old DOM `main/tooltip.ts` (`createTooltip`/`updateTooltip`) onto the retained
 * `@engine/ui` widget-tree pattern established by `createResourceHud` (Citadel) /
 * `createWorldClock` (Farm chunk 1): the tree is built ONCE by {@link createTooltip}, then
 * `refresh(state)` re-textures its title/description labels + visibility in place each frame.
 *
 * This module does NOT re-derive "which sprite is hovered" — that nearest-sprite-under-cursor
 * logic already lives in the old DOM tooltip's `updateTooltip` (world-space distance search
 * over `SnapshotSprite[]`); the host (a later integration chunk) keeps running that same
 * derivation and passes the result in as {@link TooltipState}, plus the screen point to anchor
 * near (host-supplied cursor position, since this module has no input access of its own).
 *
 * ## Wrapping
 * `LabelNode`/`computeLayout` have no built-in `maxWidth` word-wrap (that's a `drawText`-level
 * option the node model doesn't expose) — so the description is pre-wrapped here via
 * `layoutText(text, { maxWidth })` into an explicit `\n`-joined string before being set as the
 * label's `text`. `layoutText`/`drawText` both honour explicit `\n` breaks regardless of
 * `maxWidth`, so the label then measures/draws as a correctly wrapped multi-line block.
 *
 * EDG32-only: every colour is an `EDG.*` constant (mirrors the DOM tooltip's cream title /
 * muted description on a dark chrome background).
 */
import { EDG } from "@engine/core";
import { box, label, layoutText, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";

/**
 * Max pixel width the description wraps to before breaking to a new line. Tuned for ~35-40
 * characters/line at the body font's advance (`BODY_FONT.metrics.advance`, 9px/glyph for the
 * authored UNSCII font vs. the old 5px-glyph bitmap font's ~6px advance) — 220px was sized for
 * the old, narrower font (~36 chars/line); kept at the same ratio (`330 = 220 * 9/6`) so the
 * tooltip doesn't wrap to noticeably shorter, taller blocks now that glyphs are wider.
 */
const DESCRIPTION_MAX_WIDTH = 330;
/** Cursor offset (px) the host should use if it wants the tooltip anchored near the cursor. */
export const TOOLTIP_CURSOR_OFFSET = { dx: 12, dy: -20 } as const;

/** The live values the tooltip displays. Supplied each frame by the host. */
export interface TooltipState {
  /** The hovered sprite's label, or `null` when nothing is hovered (hides the tooltip). */
  label: string | null;
  /** The hovered sprite's optional description (wrapped + shown below the label). */
  description?: string | null;
}

/** The retained tooltip: its root node (laid out + rendered by the host) plus refresh(). */
export interface Tooltip {
  /** The widget tree root — pass to `computeLayout` / `renderTree`. Not a11y-mirrored (transient, pointer-follow chrome, mirrors the old DOM tooltip's `pointer-events: none`). */
  readonly root: ContainerNode;
  /**
   * Re-bind the title/description labels + visibility from the latest hover state. Call once
   * per frame.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call (title/description text, or
   * visibility, changed), so the host can gate the expensive `computeLayout` behind it. The
   * first call always returns `true`. `renderTree`/`surface` must still run every frame — when
   * hidden, `root.opacity` is 0, so `renderTree` draws nothing but is still safe to call.
   */
  refresh(state: TooltipState): boolean;
  /** Whether the tooltip has anything to show (mirrors the DOM tooltip's `display !== "none"`). */
  isVisible(): boolean;
}

function setText(lbl: LabelNode, text: string): boolean {
  if (lbl.text === text) return false;
  lbl.text = text;
  return true;
}

/** Pre-wrap `text` to `maxWidth` px, joining the resulting lines with explicit `\n` breaks. */
function wrapDescription(text: string): string {
  const laid = layoutText(text, { maxWidth: DESCRIPTION_MAX_WIDTH });
  return laid.lines.map((l) => l.text).join("\n");
}

/**
 * Build the retained tooltip widget tree. The tree is created once; `refresh` mutates it per
 * frame (no re-allocation). Layout: title label, then (if present) the wrapped description
 * label below it, muted, in a single chrome panel.
 */
export function createTooltip(): Tooltip {
  const titleLbl = label("", { color: EDG.cream });
  const descLbl = label("", { color: EDG.steel });

  const column = box({ direction: "column", gap: 2 }, [titleLbl, descLbl]);
  const root = panel({ direction: "row" }, [column]);
  root.opacity = 0;

  let changed = false;
  let firstRefresh = true;
  let visible = false;

  function refresh(state: TooltipState): boolean {
    changed = false;

    if (state.label === null) {
      if (root.opacity !== 0) changed = true;
      root.opacity = 0;
      visible = false;
      const result = changed || firstRefresh;
      firstRefresh = false;
      return result;
    }

    if (root.opacity !== 1) changed = true;
    root.opacity = 1;
    visible = true;

    if (setText(titleLbl, state.label)) changed = true;

    const description = state.description ?? null;
    const wrapped = description !== null && description !== "" ? wrapDescription(description) : "";
    if (setText(descLbl, wrapped)) changed = true;

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh, isVisible: () => visible };
}
