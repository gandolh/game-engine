import { computeLayout } from "../layout/layout";
import type { Theme } from "../theme/theme";
import { DEFAULT_THEME } from "../theme/theme";
import type { UINode } from "../widget/node";
import { box } from "../widget/node";
import type { ScrollViewportNode } from "./node";

/**
 * Lay out `vp.children` in the virtual content area.
 *
 * Wraps all children in a temporary `box` rooted at `(0, 0)` and runs `computeLayout`
 * so that every child receives a `rect` in content-space (origin at top-left of the
 * content area). After the call:
 *  - every child node has a valid `rect` relative to `(0, 0)`,
 *  - `vp.contentSize` is updated to the measured content bounding box.
 *
 * The scroll viewport's own `rect` (viewport position and size) is NOT set here — that
 * comes from a parent `computeLayout` call, or from manually assigning `vp.rect`.
 *
 * @param vp     The scroll viewport whose children to lay out.
 * @param theme  Theme tokens. Defaults to `DEFAULT_THEME`.
 * @param contentLayout  Optional layout overrides for the content wrapper (e.g. force a
 *               minimum width). By default a column with `padding:0, gap:0`.
 */
export function computeScrollContent(
  vp: ScrollViewportNode,
  theme: Theme = DEFAULT_THEME,
  contentLayout: { direction?: "row" | "column"; gap?: number; padding?: number } = {},
): void {
  if (vp.children.length === 0) {
    vp.contentSize = { width: 0, height: 0 };
    return;
  }

  // Wrap in a transient box so computeLayout can measure all children together.
  const wrapper = box(
    {
      direction: contentLayout.direction ?? "column",
      gap: contentLayout.gap ?? 0,
      padding: contentLayout.padding ?? 0,
    },
    vp.children as UINode[],
  );

  computeLayout(wrapper, 0, 0, theme);

  vp.contentSize = { width: wrapper.rect.width, height: wrapper.rect.height };
}
