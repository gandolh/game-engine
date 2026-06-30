import type { ButtonState } from "../theme/theme";

/**
 * `@engine/ui` widget model — **retained mode**.
 *
 * The UI is a persistent tree of `UINode`s with **stable identity**: a node is created once
 * (via {@link panel}/{@link box}/{@link label}/{@link button}) and kept across frames, then
 * laid out and rendered each frame. This is deliberate — later chunks rely on the identity:
 *
 *  - Chunk 4 (input) hit-tests against a node's computed `rect` and routes events to the
 *    exact node instance (and drives {@link ButtonNode.state}).
 *  - Chunk 5 (a11y) mirrors each node to a DOM element keyed by its identity and invokes the
 *    same {@link ButtonNode.onActivate} handle.
 *
 * Every node owns:
 *  - an `id` (assigned on construction; stable for the node's lifetime) for keying,
 *  - a `kind` discriminant, `children`, and a `layout` props bag (see `../layout`),
 *  - a `rect` filled in by `computeLayout` — the node's computed screen-space box.
 *
 * Construction is plain functions returning mutable objects; mutate props directly between
 * frames (e.g. `btn.state = "hover"`, `lbl.text = "…"`) then re-run layout/render.
 */

import type { LayoutProps } from "../layout/props";

/** Computed screen-space rectangle (px, top-left origin), filled in by `computeLayout`. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type UINodeKind = "panel" | "box" | "label" | "button";

interface BaseNode {
  /** Stable per-node id (unique within a process run). Used for keying/hit-test/a11y. */
  readonly id: number;
  readonly kind: UINodeKind;
  /** Layout properties driving this node's size/placement (see `../layout/props`). */
  layout: LayoutProps;
  /** Child nodes (containers only; leaves keep an empty array). */
  children: UINode[];
  /** Computed screen-space box. `{0,0,0,0}` until `computeLayout` has run. */
  rect: Rect;
  /**
   * Optional render opacity in [0,1] (default 1). MULTIPLIES down the subtree during
   * `renderTree`, so fading a container fades it and all its children together — pair with
   * the `anim` tweens to fade a panel in/out (e.g. transient toasts). Layout-only passes
   * ignore it; it affects rendering alpha only.
   */
  opacity?: number;
}

/** A container that arranges its children in a row or column (see `layout.direction`). */
export interface ContainerNode extends BaseNode {
  readonly kind: "panel" | "box";
  /**
   * Whether to paint a themed background + border behind this container. `panel` defaults
   * to `true` (a visible chrome panel); `box` defaults to `false` (an invisible layout
   * grouping). Override per node.
   */
  background: boolean;
}

/** A text leaf. Sizes itself from `measureText`/`layoutText` (Chunk 2) during layout. */
export interface LabelNode extends BaseNode {
  readonly kind: "label";
  children: [];
  text: string;
  /** Override the theme text colour for this label. `EDG.*`. */
  color?: string;
  /** Override the theme text scale for this label. */
  scale?: number;
  /** If true, use the theme's muted text colour (ignored when `color` is set). */
  muted?: boolean;
}

/** An activatable button leaf with a text label and per-state theming. */
export interface ButtonNode extends BaseNode {
  readonly kind: "button";
  children: [];
  label: string;
  /**
   * Visual + interaction state. The input chunk drives this; the render walk maps it to
   * theme colours. `disabled` also suppresses activation.
   */
  state: ButtonState;
  /**
   * Activation handle, invoked by the input chunk (click/Enter) AND by the a11y mirror.
   * A callback was chosen over a string command id so the toolkit stays dependency-free and
   * games wire their own dispatch; pass `() => dispatch("my.command")` if you prefer ids.
   */
  onActivate?: () => void;
  /** Override the theme text scale for this button's label. */
  scale?: number;
}

export type UINode = ContainerNode | LabelNode | ButtonNode;

let nextId = 1;

/** Reset the node id counter — test-only, to keep ids stable across isolated test cases. */
export function resetNodeIds(): void {
  nextId = 1;
}

function emptyRect(): Rect {
  return { x: 0, y: 0, width: 0, height: 0 };
}
function freshId(): number {
  return nextId++;
}

/** Create a chrome **panel** container (themed background + border by default). */
export function panel(layout: LayoutProps = {}, children: UINode[] = []): ContainerNode {
  return { id: freshId(), kind: "panel", layout, children, rect: emptyRect(), background: true };
}

/** Create an invisible **box** layout container (no background by default). */
export function box(layout: LayoutProps = {}, children: UINode[] = []): ContainerNode {
  return { id: freshId(), kind: "box", layout, children, rect: emptyRect(), background: false };
}

/** Create a **label** (text leaf). */
export function label(
  text: string,
  opts: { layout?: LayoutProps; color?: string; scale?: number; muted?: boolean } = {},
): LabelNode {
  const node: LabelNode = {
    id: freshId(),
    kind: "label",
    layout: opts.layout ?? {},
    children: [],
    rect: emptyRect(),
    text,
  };
  if (opts.color !== undefined) node.color = opts.color;
  if (opts.scale !== undefined) node.scale = opts.scale;
  if (opts.muted !== undefined) node.muted = opts.muted;
  return node;
}

/** Create a **button** (activatable leaf), defaulting to the `normal` state. */
export function button(
  text: string,
  opts: {
    layout?: LayoutProps;
    onActivate?: () => void;
    state?: ButtonState;
    scale?: number;
  } = {},
): ButtonNode {
  const node: ButtonNode = {
    id: freshId(),
    kind: "button",
    layout: opts.layout ?? {},
    children: [],
    rect: emptyRect(),
    label: text,
    state: opts.state ?? "normal",
  };
  if (opts.onActivate !== undefined) node.onActivate = opts.onActivate;
  if (opts.scale !== undefined) node.scale = opts.scale;
  return node;
}

/** Type guard: is this node a container (panel/box)? */
export function isContainer(node: UINode): node is ContainerNode {
  return node.kind === "panel" || node.kind === "box";
}
