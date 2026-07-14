import type { UISurface } from "../render/ui-surface";
import { drawText } from "../text/draw";
import { layoutText } from "../text/layout";
import { measureText } from "../text/layout";
import { drawIcon } from "../icon/draw";
import { ICON_SIZE } from "../icon/icons";
import type { Theme } from "../theme/theme";
import { DEFAULT_THEME } from "../theme/theme";
import { resolvePadding } from "../layout/props";
import type {
  ButtonNode,
  CheckboxNode,
  ContainerNode,
  IconNode,
  LabelNode,
  SliderNode,
  UINode,
} from "./node";

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
 *
 * A node's optional `opacity` (default 1) multiplies down the subtree, so fading a container
 * fades it and its children together (used by transient toasts via the `anim` tweens).
 */
export function renderTree(surface: UISurface, root: UINode, theme: Theme = DEFAULT_THEME): void {
  drawNode(surface, root, theme, 1);
}

function drawNode(surface: UISurface, node: UINode, theme: Theme, alpha: number): void {
  const a = alpha * (node.opacity ?? 1);
  if (a <= 0) return; // fully transparent — skip the subtree (ui-draw also no-ops alpha≤0)
  switch (node.kind) {
    case "panel":
    case "box":
      drawContainer(surface, node, theme, a);
      for (const child of node.children) drawNode(surface, child, theme, a);
      break;
    case "label":
      drawLabel(surface, node, theme, a);
      break;
    case "icon":
      drawIconNode(surface, node, theme, a);
      break;
    case "button":
      drawButton(surface, node, theme, a);
      break;
    case "slider":
      drawSlider(surface, node, theme, a);
      break;
    case "checkbox":
      drawCheckbox(surface, node, theme, a);
      break;
  }
}

function drawContainer(surface: UISurface, node: ContainerNode, theme: Theme, alpha: number): void {
  if (!node.background) return;
  const { x, y, width, height } = node.rect;
  const bw = theme.borderWidth;
  if (bw > 0) {
    // Border = a filled border-colour rect with the bg inset by the border width.
    surface.rect(x, y, width, height, theme.panelBorder, alpha);
    surface.rect(x + bw, y + bw, width - 2 * bw, height - 2 * bw, theme.panelBg, alpha);
  } else {
    surface.rect(x, y, width, height, theme.panelBg, alpha);
  }
}

function drawLabel(surface: UISurface, node: LabelNode, theme: Theme, alpha: number): void {
  const scale = node.scale ?? theme.textScale;
  const color = node.color ?? (node.muted ? theme.textMuted : theme.textColor);
  // `maxWidth` wraps (drawText → layoutText); omitted, the label stays one unwrapped line.
  // Kept as a conditional spread so `exactOptionalPropertyTypes` isn't handed an explicit
  // `maxWidth: undefined`.
  drawText(surface, node.text, node.rect.x, node.rect.y, {
    color,
    scale,
    alpha,
    ...(node.maxWidth === undefined ? {} : { maxWidth: node.maxWidth }),
  });
}

function drawIconNode(surface: UISurface, node: IconNode, theme: Theme, alpha: number): void {
  const scale = node.scale ?? theme.textScale;
  drawIcon(surface, node.icon, node.rect.x, node.rect.y, { ramp: node.ramp, scale, alpha });
}

function drawButton(surface: UISurface, node: ButtonNode, theme: Theme, alpha: number): void {
  const { x, y, width, height } = node.rect;
  const bg = theme.buttonBg[node.state];
  const fg = theme.buttonText[node.state];
  surface.rect(x, y, width, height, bg, alpha);

  const scale = node.scale ?? theme.textScale;
  const pad = resolvePadding(node.layout.padding, theme.padding);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (node.icon) {
    // Centre the icon (its ramp's "normal" text colour has no analogue here — the caller's
    // ramp is fixed regardless of button state, same as how a themed icon button would look
    // in any other pixel-art UI toolkit; state is still legible via the button's own fill).
    const iw = ICON_SIZE * scale;
    const ih = ICON_SIZE * scale;
    const ix = x + pad.left + Math.max(0, (innerW - iw) / 2);
    const iy = y + pad.top + Math.max(0, (innerH - ih) / 2);
    drawIcon(surface, node.icon.name, ix, iy, { ramp: node.icon.ramp, scale, alpha });
    return;
  }

  // Centre the label within the button's padding box.
  const tw = measureText(node.label, { scale });
  const th = layoutText(node.label, { scale }).height;
  const tx = x + pad.left + Math.max(0, (innerW - tw) / 2);
  const ty = y + pad.top + Math.max(0, (innerH - th) / 2);
  drawText(surface, node.label, tx, ty, { color: fg, scale, alpha });
}

/**
 * Draw a slider: a thin centred track groove, a fill from the track's left edge to the thumb,
 * and a square thumb centred on the value's x. The thumb x mirrors the node's value↔pixel
 * mapping (`valueFromPointerX`): `t = (value-min)/(max-min)` across the full rect width, so a
 * pointer at the thumb's centre reads back the same value.
 *
 * The rendered thumb is clamped to stay fully within the track bounds `[x, x+width-thumbW]`,
 * preventing overflow at min/max values (value↔pointer mapping is left unchanged).
 */
function drawSlider(surface: UISurface, node: SliderNode, theme: Theme, alpha: number): void {
  const { x, y, width, height } = node.rect;
  const range = node.max - node.min;
  const t = range > 0 ? (node.value - node.min) / range : 0;

  // Square thumb the full node height; track is a thinner bar centred vertically.
  const thumbW = height;
  const trackH = Math.max(2, Math.round(height / 3));
  const trackY = y + (height - trackH) / 2;
  // Ideal thumb x (centred on value position); clamped so the whole thumb stays within [x, x+width-thumbW].
  const thumbXIdeal = x + t * width - thumbW / 2;
  const thumbX = Math.max(x, Math.min(thumbXIdeal, x + width - thumbW));
  const thumbCenterX = x + t * width;

  surface.rect(x, trackY, width, trackH, theme.sliderTrack, alpha);
  if (thumbCenterX > x) {
    surface.rect(x, trackY, thumbCenterX - x, trackH, theme.sliderFill, alpha);
  }
  surface.rect(thumbX, y, thumbW, height, theme.sliderThumb[node.state], alpha);
}

/**
 * Draw a checkbox: a bordered square box (filled per state), a check mark (an inset filled square)
 * when `checked`, and the optional inline label to the right. The box-size/gap math mirrors the
 * layout pass so the hit rect and the visuals agree.
 */
function drawCheckbox(surface: UISurface, node: CheckboxNode, theme: Theme, alpha: number): void {
  const { x, y, height } = node.rect;
  const scale = node.scale ?? theme.textScale;
  const boxSize = layoutText("M", { scale }).height;

  // Box: border rect with the state fill inset by the theme border width.
  const bw = theme.borderWidth;
  if (bw > 0) {
    surface.rect(x, y, boxSize, boxSize, theme.checkboxBorder, alpha);
    surface.rect(x + bw, y + bw, boxSize - 2 * bw, boxSize - 2 * bw, theme.checkboxBox[node.state], alpha);
  } else {
    surface.rect(x, y, boxSize, boxSize, theme.checkboxBox[node.state], alpha);
  }

  // Check mark: a filled inset square (a glyph-free tick that stays crisp at any scale).
  if (node.checked) {
    const inset = Math.max(2, Math.round(boxSize / 4));
    surface.rect(x + inset, y + inset, boxSize - 2 * inset, boxSize - 2 * inset, theme.checkboxCheck, alpha);
  }

  // Inline label, vertically centred against the box.
  if (node.label.length > 0) {
    const color = node.state === "disabled" ? theme.textMuted : theme.textColor;
    const th = layoutText(node.label, { scale }).height;
    const tx = x + boxSize + theme.gap;
    const ty = y + Math.max(0, (height - th) / 2);
    drawText(surface, node.label, tx, ty, { color, scale, alpha });
  }
}
