import { layoutText } from "../text/layout";
import { measureText } from "../text/layout";
import type { Theme } from "../theme/theme";
import { DEFAULT_THEME } from "../theme/theme";
import type { UINode } from "../widget/node";
import { isContainer } from "../widget/node";
import type { Align, Direction, Padding } from "./props";
import { resolvePadding } from "./props";

/**
 * Two-pass flex layout for the `@engine/ui` retained tree.
 *
 * Pass 1 ({@link measureNode}) computes each node's **intrinsic** size bottom-up:
 *   - a label/button sizes from its measured text (Chunk 2) plus, for buttons, padding;
 *   - a container sizes to its packed children (main axis: sum + gaps; cross axis: max),
 *     plus its own padding;
 *   - a fixed `width`/`height` overrides the intrinsic value on that axis.
 *
 * Pass 2 ({@link arrange}) walks top-down placing children: it positions the node's box at
 * the given (x,y,width,height), distributes leftover main-axis space to `grow` children,
 * applies `gap` between children, and aligns each child on the cross axis (start/center/end/
 * stretch). Each node's computed `rect` is written in place.
 *
 * `computeLayout(root, x, y, theme, size?)` runs both passes and returns the root for
 * chaining. Pure w.r.t. the theme (reads tokens, never mutates); mutates only node `rect`s.
 */

export interface ComputeLayoutOptions {
  /** Pin the root's outer width (px). Default: the root's intrinsic width. */
  width?: number;
  /** Pin the root's outer height (px). Default: the root's intrinsic height. */
  height?: number;
}

/** Intrinsic (content) size of a node in px, before grow/stretch redistribution. */
interface Intrinsic {
  width: number;
  height: number;
}

function dirOf(node: UINode): Direction {
  return node.layout.direction ?? "column";
}
function alignOf(node: UINode): Align {
  return node.layout.align ?? "start";
}
function gapOf(node: UINode, theme: Theme): number {
  return node.layout.gap ?? theme.gap;
}
function paddingOf(node: UINode, theme: Theme): Padding {
  return resolvePadding(node.layout.padding, isContainer(node) ? theme.padding : 0);
}

/** Intrinsic text size of a label/button's string at its resolved scale. */
function textSize(text: string, scale: number): Intrinsic {
  const l = layoutText(text, { scale });
  return { width: measureText(text, { scale }), height: l.height };
}

/** Pass 1: compute and cache each node's intrinsic size; returns this node's. */
function measureNode(node: UINode, theme: Theme, cache: Map<number, Intrinsic>): Intrinsic {
  let size: Intrinsic;

  if (node.kind === "label") {
    const scale = node.scale ?? theme.textScale;
    size = textSize(node.text, scale);
  } else if (node.kind === "button") {
    const scale = node.scale ?? theme.textScale;
    const pad = paddingOf(node, theme);
    const t = textSize(node.label, scale);
    size = {
      width: t.width + pad.left + pad.right,
      height: t.height + pad.top + pad.bottom,
    };
  } else {
    // Container: pack children intrinsically.
    const pad = paddingOf(node, theme);
    const gap = gapOf(node, theme);
    const dir = dirOf(node);
    let main = 0;
    let cross = 0;
    let count = 0;
    for (const child of node.children) {
      const c = measureNode(child, theme, cache);
      const cMain = dir === "row" ? c.width : c.height;
      const cCross = dir === "row" ? c.height : c.width;
      main += cMain;
      if (cCross > cross) cross = cCross;
      count += 1;
    }
    if (count > 1) main += gap * (count - 1);
    const innerW = dir === "row" ? main : cross;
    const innerH = dir === "row" ? cross : main;
    size = {
      width: innerW + pad.left + pad.right,
      height: innerH + pad.top + pad.bottom,
    };
  }

  // Fixed sizes override intrinsic on each axis.
  if (node.layout.width !== undefined) size.width = node.layout.width;
  if (node.layout.height !== undefined) size.height = node.layout.height;

  cache.set(node.id, size);
  return size;
}

/** Pass 2: place `node` at (x,y) with the given outer size, then recurse into children. */
function arrange(
  node: UINode,
  x: number,
  y: number,
  width: number,
  height: number,
  theme: Theme,
  cache: Map<number, Intrinsic>,
): void {
  node.rect = { x, y, width, height };
  if (!isContainer(node) || node.children.length === 0) return;

  const pad = paddingOf(node, theme);
  const gap = gapOf(node, theme);
  const dir = dirOf(node);
  const align = alignOf(node);

  const innerX = x + pad.left;
  const innerY = y + pad.top;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const mainAvail = dir === "row" ? innerW : innerH;
  const crossAvail = dir === "row" ? innerH : innerW;

  // Sum intrinsic main sizes + total grow weight.
  let usedMain = 0;
  let totalGrow = 0;
  const n = node.children.length;
  for (const child of node.children) {
    const ci = cache.get(child.id)!;
    usedMain += dir === "row" ? ci.width : ci.height;
    totalGrow += child.layout.grow ?? 0;
  }
  if (n > 1) usedMain += gap * (n - 1);
  const leftover = Math.max(0, mainAvail - usedMain);

  let cursor = dir === "row" ? innerX : innerY;
  for (let i = 0; i < n; i += 1) {
    const child = node.children[i]!;
    const ci = cache.get(child.id)!;
    const grow = child.layout.grow ?? 0;

    let childMain = dir === "row" ? ci.width : ci.height;
    if (totalGrow > 0 && grow > 0) childMain += (leftover * grow) / totalGrow;

    const childCrossIntrinsic = dir === "row" ? ci.height : ci.width;
    // Cross-axis size + offset from alignment.
    let childCross = childCrossIntrinsic;
    let crossOffset = 0;
    if (align === "stretch") {
      childCross = crossAvail;
    } else if (align === "center") {
      crossOffset = (crossAvail - childCrossIntrinsic) / 2;
    } else if (align === "end") {
      crossOffset = crossAvail - childCrossIntrinsic;
    } // "start" → 0

    let cx: number;
    let cy: number;
    let cw: number;
    let ch: number;
    if (dir === "row") {
      cx = cursor;
      cy = innerY + crossOffset;
      cw = childMain;
      ch = childCross;
    } else {
      cx = innerX + crossOffset;
      cy = cursor;
      cw = childCross;
      ch = childMain;
    }

    arrange(child, cx, cy, cw, ch, theme, cache);
    cursor += childMain + gap;
  }
}

/**
 * Lay `root` out at screen (`x`,`y`), writing every node's computed `rect`. Sizes the root
 * to its intrinsic content unless `opts.width`/`height` pin it. Returns `root` for chaining.
 */
export function computeLayout(
  root: UINode,
  x: number,
  y: number,
  theme: Theme = DEFAULT_THEME,
  opts: ComputeLayoutOptions = {},
): UINode {
  const cache = new Map<number, Intrinsic>();
  const intrinsic = measureNode(root, theme, cache);
  const width = opts.width ?? intrinsic.width;
  const height = opts.height ?? intrinsic.height;
  arrange(root, x, y, width, height, theme, cache);
  return root;
}
