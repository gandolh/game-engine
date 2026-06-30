import type { ButtonNode, UINode } from "../widget/node";
import { isContainer } from "../widget/node";

/**
 * Focus traversal order for the `@engine/ui` tree.
 *
 * The focusable set is the buttons, in **tree order** (pre-order depth-first — the same order
 * `renderTree` walks and a reader would encounter them). `disabled` buttons are skipped: they
 * cannot be focused, just as they cannot be hovered or activated. Tab moves forward through this
 * list (wrapping at the end); Shift-Tab moves backward (wrapping at the start).
 */

/** Collect focusable buttons (non-disabled) under `root`, in pre-order tree order. */
export function focusables(root: UINode): ButtonNode[] {
  const out: ButtonNode[] = [];
  walk(root, out);
  return out;
}

function walk(node: UINode, out: ButtonNode[]): void {
  if (node.kind === "button") {
    if (node.state !== "disabled") out.push(node);
    return;
  }
  if (isContainer(node)) {
    for (const child of node.children) walk(child, out);
  }
}
