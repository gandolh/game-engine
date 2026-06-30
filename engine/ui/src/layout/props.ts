/**
 * Layout properties for a `@engine/ui` node — a flexbox-lite model.
 *
 * A container lays its children out along its `direction` (a row or column). Along the main
 * axis, children are packed with `gap` between them; any leftover space is distributed to
 * children with a positive `grow` weight. Along the cross axis, children are placed per the
 * container's `align`. Fixed `width`/`height` pin a node's size; otherwise a node sizes to
 * its content (containers) or measured text (labels/buttons).
 *
 * All numbers are screen pixels. Omitted spacing falls back to the active theme's defaults.
 */

/** Main-axis direction of a container. */
export type Direction = "row" | "column";

/** Cross-axis alignment of children within a container. */
export type Align = "start" | "center" | "end" | "stretch";

/** Symmetric or per-side padding inside a container, in px. */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutProps {
  /** Container main axis. Default `"column"`. Ignored for leaves. */
  direction?: Direction;
  /** Cross-axis alignment of children. Default `"start"`. */
  align?: Align;
  /** Inner padding. A number = all four sides; or per-side. Default: theme padding. */
  padding?: number | Partial<Padding>;
  /** Space between children along the main axis. Default: theme gap. */
  gap?: number;
  /** Fixed width in px. If set, overrides content/text sizing. */
  width?: number;
  /** Fixed height in px. If set, overrides content/text sizing. */
  height?: number;
  /**
   * Main-axis grow weight. 0 = size to content (default). >0 = absorb a share of the
   * container's leftover main-axis space proportional to the weight.
   */
  grow?: number;
}

/** Resolve a `padding` prop (number | per-side | undefined) into a full {@link Padding}. */
export function resolvePadding(p: LayoutProps["padding"], fallback: number): Padding {
  if (p === undefined) return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  if (typeof p === "number") return { top: p, right: p, bottom: p, left: p };
  return {
    top: p.top ?? 0,
    right: p.right ?? 0,
    bottom: p.bottom ?? 0,
    left: p.left ?? 0,
  };
}
