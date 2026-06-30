import type { ButtonNode, CheckboxNode, SliderNode, UINode } from "../widget/node";
import { isContainer } from "../widget/node";

/**
 * Focus traversal order for the `@engine/ui` tree.
 *
 * The focusable set is the interactive leaves — buttons, sliders, and checkboxes — in **tree
 * order** (pre-order depth-first, the same order `renderTree` walks and a reader would encounter
 * them). A `disabled` control is skipped: it cannot be focused, just as it cannot be hovered or
 * activated. Tab moves forward through this list (wrapping at the end); Shift-Tab moves backward
 * (wrapping at the start).
 */

/** A node that can hold keyboard focus and be operated via the keyboard. */
export type FocusableNode = ButtonNode | SliderNode | CheckboxNode;

/** True for the interactive leaf kinds that participate in focus traversal. */
export function isFocusable(node: UINode): node is FocusableNode {
  return node.kind === "button" || node.kind === "slider" || node.kind === "checkbox";
}

/** Collect focusable (non-disabled) interactive leaves under `root`, in pre-order tree order. */
export function focusables(root: UINode): FocusableNode[] {
  const out: FocusableNode[] = [];
  walk(root, out);
  return out;
}

function walk(node: UINode, out: FocusableNode[]): void {
  if (isFocusable(node)) {
    if (node.state !== "disabled") out.push(node);
    return;
  }
  if (isContainer(node)) {
    for (const child of node.children) walk(child, out);
  }
}
