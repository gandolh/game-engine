import type { UISurface } from "../render/ui-surface";
import type { Theme } from "../theme/theme";
import { DEFAULT_THEME } from "../theme/theme";
import type { Rect, UINode } from "../widget/node";
import { renderTree } from "../widget/render";
import type { ScrollViewportNode } from "./node";

/**
 * Render a `ScrollViewportNode` through a `UISurface`.
 *
 * The render walk:
 *  1. Translates every child's `rect` by the viewport's screen origin minus `scrollOffset`
 *     (converting content-space coords → screen-space).
 *  2. Skips (culls) children whose translated rect falls **entirely** outside the viewport.
 *  3. Renders surviving children via `renderTree` with their translated rects.
 *  4. Restores the original rects when done so the tree remains in content-space for
 *     the next frame's layout/hit-test.
 *
 * The caller is responsible for calling `surface.begin()/end()` around the full UI frame
 * (this function does NOT open/close the surface).
 */
export function renderScrollViewport(
  surface: UISurface,
  vp: ScrollViewportNode,
  theme: Theme = DEFAULT_THEME,
): void {
  const { x: vpX, y: vpY, width: vpW, height: vpH } = vp.rect;
  const ox = vpX - vp.scrollOffset.x;
  const oy = vpY - vp.scrollOffset.y;

  for (const child of vp.children) {
    // Translate child (and all descendants) to screen space.
    translateTree(child, ox, oy);
    try {
      // Cull: if the child's translated rect is fully outside the viewport, skip it.
      if (!overlapsViewport(child.rect, vpX, vpY, vpW, vpH)) {
        continue;
      }
      renderTree(surface, child, theme);
    } finally {
      // Always restore rects to content-space regardless of cull.
      translateTree(child, -ox, -oy);
    }
  }
}

/** True when `r` overlaps the viewport rectangle (at least 1px of shared area). */
function overlapsViewport(r: Rect, vpX: number, vpY: number, vpW: number, vpH: number): boolean {
  return r.x < vpX + vpW && r.x + r.width > vpX && r.y < vpY + vpH && r.y + r.height > vpY;
}

/** Recursively translate every `rect` in a node tree by `(dx, dy)`. */
function translateTree(node: UINode, dx: number, dy: number): void {
  node.rect = { ...node.rect, x: node.rect.x + dx, y: node.rect.y + dy };
  for (const child of node.children) {
    translateTree(child, dx, dy);
  }
}
