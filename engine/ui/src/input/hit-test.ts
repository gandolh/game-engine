import type { Rect, UINode } from "../widget/node";
import { isContainer } from "../widget/node";
import { isFocusable } from "./focus";

/**
 * Hit-testing for the `@engine/ui` retained tree.
 *
 * A screen point is tested against each node's computed `rect` (filled in by `computeLayout`).
 * "Topmost" follows **draw order**: `renderTree` paints a parent before its children and earlier
 * siblings before later ones, so the visually-frontmost node under a point is the *last* one (in
 * a pre-order/depth-first walk) whose rect contains it. We therefore walk children back-to-front
 * and recurse depth-first, returning the deepest/last hittable node.
 *
 * Hittability (what captures a pointer vs. falls through to the world below):
 *  - **buttons, sliders, checkboxes** are always hittable (interactive leaves react/activate);
 *  - **panels** (`background === true`) are hittable — a chrome panel captures clicks so they
 *    don't leak to the world behind it;
 *  - **boxes** (`background === false`) and **labels** are pass-through by default; a box opts in
 *    by setting `background = true` (it then behaves like a panel for hit purposes).
 *
 * Pass-through nodes are still *descended into* — a pass-through box may contain a button — but the
 * box itself never becomes the hit target.
 */

/** Is `node` itself a valid hit target (vs. transparent to the pointer)? */
export function isHittable(node: UINode): boolean {
  // Interactive leaves (focusable nodes) always capture the pointer — use isFocusable so both
  // lists stay in sync; adding a new interactive kind only requires updating focus.ts.
  if (isFocusable(node)) return true;
  if (isContainer(node)) return node.background;
  return false;
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/**
 * Find the topmost hittable node under (`x`,`y`), or `null` if the point hits nothing hittable.
 * Children are tested front-to-back (last-drawn = frontmost); a hit inside a child wins over the
 * parent. Nodes outside their own rect prune their subtree (children are laid out within parents).
 */
export function hitTest(root: UINode, x: number, y: number): UINode | null {
  if (!contains(root.rect, x, y)) return null;

  // Front-to-back: later siblings draw on top, so test them first.
  if (isContainer(root)) {
    for (let i = root.children.length - 1; i >= 0; i -= 1) {
      const hit = hitTest(root.children[i]!, x, y);
      if (hit) return hit;
    }
  }

  return isHittable(root) ? root : null;
}
