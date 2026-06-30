import type { UISurface } from "../render/ui-surface";
import { drawText } from "../text/draw";
import { layoutText } from "../text/layout";
import { measureText } from "../text/layout";
import type { Theme } from "../theme/theme";
import { DEFAULT_THEME } from "../theme/theme";
import { resolvePadding } from "../layout/props";
import type { ButtonNode, LabelNode, ContainerNode, UINode } from "./node";

/**
 * Render walk for the `@engine/ui` retained tree.
 *
 * Given a tree whose `rect`s have been filled in by `computeLayout`, `renderTree` emits the
 * quads + text for the whole tree through a {@link UISurface} (the Chunk-1 seam). It does
 * NOT open/close the surface — the caller wraps the whole UI between `surface.begin()` and
 * `surface.end()` (so multiple roots share one draw-list), e.g.:
 *
 *   surface.begin();
 *   renderTree(surface, root, theme);
 *   surface.end();
 *
 * Draw order is back-to-front: a container paints its background/border first, then its
 * children (parents before children, siblings in declaration order). All colours resolve
 * through the active `theme`, so swapping the theme re-skins everything.
 */
export function renderTree(surface: UISurface, root: UINode, theme: Theme = DEFAULT_THEME): void {
  drawNode(surface, root, theme);
}

function drawNode(surface: UISurface, node: UINode, theme: Theme): void {
  switch (node.kind) {
    case "panel":
    case "box":
      drawContainer(surface, node, theme);
      for (const child of node.children) drawNode(surface, child, theme);
      break;
    case "label":
      drawLabel(surface, node, theme);
      break;
    case "button":
      drawButton(surface, node, theme);
      break;
  }
}

function drawContainer(surface: UISurface, node: ContainerNode, theme: Theme): void {
  if (!node.background) return;
  const { x, y, width, height } = node.rect;
  const bw = theme.borderWidth;
  if (bw > 0) {
    // Border = a filled border-colour rect with the bg inset by the border width.
    surface.rect(x, y, width, height, theme.panelBorder);
    surface.rect(x + bw, y + bw, width - 2 * bw, height - 2 * bw, theme.panelBg);
  } else {
    surface.rect(x, y, width, height, theme.panelBg);
  }
}

function drawLabel(surface: UISurface, node: LabelNode, theme: Theme): void {
  const scale = node.scale ?? theme.textScale;
  const color = node.color ?? (node.muted ? theme.textMuted : theme.textColor);
  drawText(surface, node.text, node.rect.x, node.rect.y, { color, scale });
}

function drawButton(surface: UISurface, node: ButtonNode, theme: Theme): void {
  const { x, y, width, height } = node.rect;
  const bg = theme.buttonBg[node.state];
  const fg = theme.buttonText[node.state];
  surface.rect(x, y, width, height, bg);

  // Centre the label within the button's padding box.
  const scale = node.scale ?? theme.textScale;
  const pad = resolvePadding(node.layout.padding, theme.padding);
  const tw = measureText(node.label, { scale });
  const th = layoutText(node.label, { scale }).height;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const tx = x + pad.left + Math.max(0, (innerW - tw) / 2);
  const ty = y + pad.top + Math.max(0, (innerH - th) / 2);
  drawText(surface, node.label, tx, ty, { color: fg, scale });
}
