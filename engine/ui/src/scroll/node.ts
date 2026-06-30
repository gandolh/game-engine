import type { LayoutProps } from "../layout/props";
import type { Rect, UINode } from "../widget/node";

/**
 * `ScrollViewportNode` — a clipping scroll container for the `@engine/ui` retained tree.
 *
 * Wraps a tree of `UINode` children and clips their visible area to its own `rect`. The
 * children are laid out in a virtual content area (whose size may be larger than the
 * viewport) and translated by `-scrollOffset` before being drawn. Children whose
 * **laid-out rect falls entirely outside the viewport** after translation are skipped
 * during render (a conservative per-quad cull; partially-overlapping children are
 * included in full).
 *
 * ### Clipping approximation
 * Because `@engine/ui` does not have a GPU scissor seam at this layer, "clipping" is
 * approximated by culling whole child nodes: a child whose translated rect is entirely
 * above, below, left, or right of the viewport rect is not emitted at all. Children
 * that straddle the boundary are rendered in full (their quads may slightly bleed
 * outside the viewport). For game-UI panels this is adequate — items in a list rarely
 * straddle the edge by more than a few pixels.
 *
 * ### Layout integration
 * `computeLayout` does not know about `ScrollViewportNode`. The caller must lay out the
 * content tree separately (via {@link computeScrollContent}) or manually, then set the
 * scroll viewport's `rect` (e.g. via a parent `computeLayout` call that sizes it with a
 * fixed `width`/`height`). {@link computeScrollContent} runs a fresh `computeLayout`
 * pass on the children, starting at `(0, 0)` so offsets are relative to the content
 * origin; the render walk then translates by `(viewport.rect.x - scrollOffset.x,
 * viewport.rect.y - scrollOffset.y)` when drawing children.
 */

/** Scroll offset (px). Positive scrolls content upward (viewport moves down through content). */
export interface ScrollOffset {
  x: number;
  y: number;
}

export interface ScrollViewportNode {
  readonly id: number;
  readonly kind: "scroll";
  layout: LayoutProps;
  /** Viewport bounds — set by the parent layout or directly. */
  rect: Rect;
  /** Children in the virtual content area. */
  children: UINode[];
  /** Current scroll position in px (content-space). Mutate directly. */
  scrollOffset: ScrollOffset;
  /**
   * Total size of the laid-out content area. Updated by {@link computeScrollContent} or
   * set manually. Used by {@link clampScroll}.
   */
  contentSize: { width: number; height: number };
}

let nextScrollId = 10_000;

/** Reset scroll-node id counter — test-only. */
export function resetScrollNodeIds(): void {
  nextScrollId = 10_000;
}

/**
 * Create a **scroll viewport** container. The viewport has a fixed size (set via
 * `layout.width`/`height` or a parent container's layout) and scrolls its children.
 *
 * Usage:
 *   const vp = scroll({ width: 200, height: 120 }, [row1, row2, row3]);
 *   computeScrollContent(vp, DEFAULT_THEME);   // lay out children in content space
 *   computeLayout(outerRoot, 0, 0, theme);     // lay out the outer tree (sets vp.rect)
 */
export function scroll(layout: LayoutProps = {}, children: UINode[] = []): ScrollViewportNode {
  return {
    id: nextScrollId++,
    kind: "scroll",
    layout,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    children,
    scrollOffset: { x: 0, y: 0 },
    contentSize: { width: 0, height: 0 },
  };
}

/**
 * Clamp `scrollOffset` so it cannot scroll past the content edges.
 * Safe to call every frame after updating offset (e.g. from wheel input).
 */
export function clampScroll(vp: ScrollViewportNode): void {
  const maxX = Math.max(0, vp.contentSize.width - vp.rect.width);
  const maxY = Math.max(0, vp.contentSize.height - vp.rect.height);
  vp.scrollOffset.x = Math.max(0, Math.min(vp.scrollOffset.x, maxX));
  vp.scrollOffset.y = Math.max(0, Math.min(vp.scrollOffset.y, maxY));
}

/**
 * Scroll by a delta in px (e.g. from a mouse-wheel event). Applies {@link clampScroll}
 * automatically.
 */
export function scrollBy(vp: ScrollViewportNode, dx: number, dy: number): void {
  vp.scrollOffset.x += dx;
  vp.scrollOffset.y += dy;
  clampScroll(vp);
}
