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
import type { IconRamp } from "../icon/draw";
import type { UISurface } from "../render/ui-surface";

/** Computed screen-space rectangle (px, top-left origin), filled in by `computeLayout`. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type UINodeKind =
  | "panel"
  | "box"
  | "label"
  | "button"
  | "slider"
  | "checkbox"
  | "icon"
  | "custom";

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
  /**
   * Wrap width in screen pixels. Without it a label is ONE unwrapped line and will happily
   * run off the side of a fixed-width panel — set this on any label whose text is dynamic
   * (a description, a cost line) inside a panel with a pinned `width`.
   */
  maxWidth?: number;
}

/** An icon leaf: a named shade-mask icon (see `../icon`), tinted by a caller-supplied ramp. */
export interface IconNode extends BaseNode {
  readonly kind: "icon";
  children: [];
  /** Icon name, looked up in the icon registry (`../icon`'s `ICONS`) at render time. */
  icon: string;
  /** The 3-colour `[dark, mid, light]` ramp tinting the icon's shade masks — the caller's own
   * palette (`EDG.*` in the engine/Farm, `CITADEL_PAL.*` in Citadel). Never baked in here. */
  ramp: IconRamp;
  /** Uniform size multiplier on the icon's native size (`ICON_SIZE`, currently 12px). Default 1. */
  scale?: number;
}

/** An icon shown by a {@link ButtonNode} in place of its text label — see {@link button}. */
export interface ButtonIcon {
  readonly name: string;
  readonly ramp: IconRamp;
}

/** An activatable button leaf with a text label and per-state theming. */
export interface ButtonNode extends BaseNode {
  readonly kind: "button";
  children: [];
  /**
   * The button's text AND its accessible name (the a11y mirror's `<button>` always uses this
   * as `textContent`, even when {@link icon} is set — an icon-only button still needs a real
   * name for assistive tech). Pass a short description ("Build house") alongside an icon.
   */
  label: string;
  /**
   * When set, the render walk draws this icon centered in the button INSTEAD OF `label`'s
   * text (visually) — `label` still backs the accessible name. Compose an icon-only build-bar
   * button with `button("Build house", { icon: { name: "house", ramp } })`.
   */
  icon?: ButtonIcon;
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
  /** Override the theme text/icon scale for this button's label/icon. */
  scale?: number;
}

/**
 * A continuous **slider** leaf: a draggable thumb over a track, mapping a horizontal position to
 * a numeric `value` in `[min, max]`. Game-agnostic — it carries no domain meaning (no "volume",
 * "zoom", …); the host gives meaning via {@link SliderNode.onChange} + an adjacent label.
 *
 * The node owns its own value↔pixel mapping (so the input dispatcher stays generic): a press/drag
 * on the slider calls {@link setValueFromPointerX} with the pointer's screen-x, and a keyboard
 * arrow calls {@link nudge}. Both clamp+round to `step`, write `value`, and (if it changed) invoke
 * `onChange`. The render walk maps `value` → thumb x within the track `rect`.
 */
export interface SliderNode extends BaseNode {
  readonly kind: "slider";
  children: [];
  /** Lower bound (inclusive) of the value range. */
  min: number;
  /** Upper bound (inclusive) of the value range. */
  max: number;
  /** Current value, always kept within `[min, max]` and snapped to `step`. */
  value: number;
  /**
   * Quantisation increment. `0` (default) = continuous (no snapping). A positive step rounds the
   * value to the nearest `min + k*step`. Also the distance a single arrow-key {@link nudge} moves.
   */
  step: number;
  /**
   * Change handle, invoked with the NEW value whenever input changes it (drag, track click, or
   * keyboard). The SAME handle the a11y mirror's `<input type=range>` calls — one command path.
   * Not called when an input maps to the value it already has.
   */
  onChange?: (value: number) => void;
  /**
   * Visual + interaction state (drives thumb/track colours). The input chunk sets `"active"`
   * while dragging and `"hover"` while pointed-at; `"disabled"` suppresses all interaction.
   */
  state: ButtonState;
  /**
   * Map a pointer screen-x to a value in `[min,max]` using this node's computed track `rect`
   * (filled by `computeLayout`). Pure — does not mutate. Clamps to the ends and snaps to `step`.
   */
  valueFromPointerX(screenX: number): number;
  /**
   * Set `value` from a pointer screen-x (via {@link valueFromPointerX}); if it differs from the
   * current value, write it and call {@link onChange}. Returns the resulting value. No-op while
   * `disabled`. The dispatcher calls this on a track press and on every drag move.
   */
  setValueFromPointerX(screenX: number): number;
  /**
   * Set `value` from an arbitrary number, applying the SAME clamp+snap the pointer path uses.
   * Writes `node.value` if the snapped result differs from the current value and returns `true`
   * in that case; returns `false` when no change occurred. Shared helper for the a11y mirror's
   * `<input type=range>` `input` handler so both surfaces go through identical validation.
   * No-op (returns `false`) while `disabled`.
   */
  setValue(v: number): boolean;
  /**
   * Move the value by `dir` steps (one `step`, or 1/100 of the range when `step` is 0), clamped
   * to `[min,max]`. Writes `value` and calls {@link onChange} on a change. Used by arrow keys.
   */
  nudge(dir: 1 | -1): number;
}

/**
 * A boolean **checkbox** / toggle leaf: a box that shows a check mark when `checked`, with an
 * optional inline `label`. Activating it (click / Enter / Space, or the mirror's native
 * `<input type=checkbox>`) flips `checked` and calls {@link onChange} with the next value.
 */
export interface CheckboxNode extends BaseNode {
  readonly kind: "checkbox";
  children: [];
  /** Current checked state; the render walk draws a check mark when `true`. */
  checked: boolean;
  /** Optional inline label drawn to the right of the box. Empty string = box only. */
  label: string;
  /**
   * Change handle, invoked with the NEXT checked value on each activation. The SAME handle the
   * a11y mirror's native checkbox `change` listener calls — one command path.
   */
  onChange?: (checked: boolean) => void;
  /**
   * Visual + interaction state (drives box/check colours). The input chunk drives hover/active;
   * `"disabled"` suppresses activation. (`checked` is orthogonal — a checkbox can be hovered
   * whether or not it is checked.)
   */
  state: ButtonState;
  /** Override the theme text scale for the inline label (and the box size, which tracks it). */
  scale?: number;
  /**
   * Flip `checked` and call {@link onChange} with the new value; returns it. No-op while
   * `disabled`. The single activation path shared by the canvas (click/key) and the mirror.
   */
  toggle(): boolean;
}

/**
 * A **custom-draw** leaf — the escape hatch for content the widget vocabulary can't express
 * (charts, minimaps, sprite-icon grids, drag ghosts). It participates in layout like any node
 * (sized by `layout.width`/`height`, or stretched/grown by its parent), then during `renderTree`
 * invokes {@link CustomNode.draw} with its COMPUTED `rect` and the inherited alpha — folding raw
 * quad/sprite drawing back INTO the tree (correct sibling z-order + opacity fade) instead of a
 * separate pass keyed off a `rect` read back after `computeLayout`. Non-interactive: it carries no
 * activation handle, so input hit-testing and the a11y mirror skip it (it's decoration).
 */
export interface CustomNode extends BaseNode {
  readonly kind: "custom";
  children: [];
  /**
   * Paint this node. Invoked during `renderTree` with the node's laid-out `rect` and the
   * multiplied-down subtree `alpha` (so a faded ancestor fades this too). The surface frame is
   * already open — draw via `surface.rect`/`surface.sprite`/`surface.push`. MUST NOT mutate the
   * tree or run layout; it is a pure paint of the given rect.
   */
  draw: (surface: UISurface, rect: Rect, alpha: number) => void;
}

export type UINode =
  | ContainerNode
  | LabelNode
  | ButtonNode
  | SliderNode
  | CheckboxNode
  | IconNode
  | CustomNode;

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
  opts: {
    layout?: LayoutProps;
    color?: string;
    scale?: number;
    muted?: boolean;
    maxWidth?: number;
  } = {},
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
  if (opts.maxWidth !== undefined) node.maxWidth = opts.maxWidth;
  return node;
}

/** Create a **button** (activatable leaf), defaulting to the `normal` state. Pass `opts.icon`
 * to show an icon instead of `text` visually — `text` still backs the accessible name. */
export function button(
  text: string,
  opts: {
    layout?: LayoutProps;
    onActivate?: () => void;
    state?: ButtonState;
    scale?: number;
    icon?: ButtonIcon;
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
  if (opts.icon !== undefined) node.icon = opts.icon;
  return node;
}

/**
 * Create a **custom-draw** leaf (the escape hatch). Size it via `layout` (`width`/`height`, a
 * `grow`, or a parent's `align:"stretch"`); `draw` is invoked each frame with the computed rect +
 * inherited alpha. See {@link CustomNode}.
 */
export function custom(
  draw: (surface: UISurface, rect: Rect, alpha: number) => void,
  layout: LayoutProps = {},
): CustomNode {
  return { id: freshId(), kind: "custom", layout, children: [], rect: emptyRect(), draw };
}

/** Create an **icon** (shade-mask leaf), tinted by `ramp` (see {@link IconRamp}). */
export function icon(
  name: string,
  ramp: IconRamp,
  opts: { layout?: LayoutProps; scale?: number } = {},
): IconNode {
  const node: IconNode = {
    id: freshId(),
    kind: "icon",
    layout: opts.layout ?? {},
    children: [],
    rect: emptyRect(),
    icon: name,
    ramp,
  };
  if (opts.scale !== undefined) node.scale = opts.scale;
  return node;
}

/**
 * Default slider track height (px) used when `layout.height` is not pinned. The thumb is square
 * and as tall as this; the track is a thinner centred bar (see the render walk). Sliders have NO
 * sensible intrinsic *width* — a value range is dimensionless — so a slider should be given a
 * fixed `layout.width` (or a `grow`); absent that it falls back to {@link SLIDER_DEFAULT_WIDTH}.
 */
export const SLIDER_DEFAULT_HEIGHT = 12;
/** Fallback slider width (px) when neither `layout.width` nor `grow` constrains it. */
export const SLIDER_DEFAULT_WIDTH = 100;

/** Clamp `v` to `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Snap `v` to the nearest `min + k*step` within `[min,max]`; `step<=0` = no snapping. */
function snap(v: number, min: number, max: number, step: number): number {
  const c = clamp(v, min, max);
  if (step <= 0) return c;
  const snapped = min + Math.round((c - min) / step) * step;
  return clamp(snapped, min, max);
}

/**
 * Create a **slider** (continuous value leaf). Give it a fixed `layout.width` (or `grow`) — a
 * value range has no intrinsic pixel width. `value` is clamped+snapped into `[min,max]` up front.
 */
export function slider(
  opts: {
    min?: number;
    max?: number;
    value?: number;
    step?: number;
    layout?: LayoutProps;
    onChange?: (value: number) => void;
    state?: ButtonState;
  } = {},
): SliderNode {
  const min = opts.min ?? 0;
  const max = opts.max ?? 1;
  const step = opts.step ?? 0;
  const node: SliderNode = {
    id: freshId(),
    kind: "slider",
    layout: opts.layout ?? {},
    children: [],
    rect: emptyRect(),
    min,
    max,
    value: snap(opts.value ?? min, min, max, step),
    step,
    state: opts.state ?? "normal",
    valueFromPointerX(screenX: number): number {
      // Map x across the track rect to [min,max]. A zero-width rect (pre-layout) pins to `min`.
      const { x, width } = this.rect;
      if (width <= 0 || this.max <= this.min) return this.min;
      const t = clamp((screenX - x) / width, 0, 1);
      return snap(this.min + t * (this.max - this.min), this.min, this.max, this.step);
    },
    setValueFromPointerX(screenX: number): number {
      if (this.state === "disabled") return this.value;
      const next = this.valueFromPointerX(screenX);
      if (next !== this.value) {
        this.value = next;
        this.onChange?.(next);
      }
      return this.value;
    },
    setValue(v: number): boolean {
      if (this.state === "disabled") return false;
      const next = snap(v, this.min, this.max, this.step);
      if (next === this.value) return false;
      this.value = next;
      return true;
    },
    nudge(dir: 1 | -1): number {
      if (this.state === "disabled") return this.value;
      const inc = this.step > 0 ? this.step : (this.max - this.min) / 100;
      const next = snap(this.value + dir * inc, this.min, this.max, this.step);
      if (next !== this.value) {
        this.value = next;
        this.onChange?.(next);
      }
      return this.value;
    },
  };
  if (opts.onChange !== undefined) node.onChange = opts.onChange;
  return node;
}

/**
 * Create a **checkbox** (boolean toggle leaf), defaulting unchecked. `label` is an optional inline
 * caption drawn to the right of the box. {@link toggle} flips `checked` and fires `onChange`.
 */
export function checkbox(
  opts: {
    checked?: boolean;
    label?: string;
    layout?: LayoutProps;
    onChange?: (checked: boolean) => void;
    state?: ButtonState;
    scale?: number;
  } = {},
): CheckboxNode {
  const node: CheckboxNode = {
    id: freshId(),
    kind: "checkbox",
    layout: opts.layout ?? {},
    children: [],
    rect: emptyRect(),
    checked: opts.checked ?? false,
    label: opts.label ?? "",
    state: opts.state ?? "normal",
    toggle(): boolean {
      if (this.state === "disabled") return this.checked;
      this.checked = !this.checked;
      this.onChange?.(this.checked);
      return this.checked;
    },
  };
  if (opts.onChange !== undefined) node.onChange = opts.onChange;
  if (opts.scale !== undefined) node.scale = opts.scale;
  return node;
}

/** Alias for {@link checkbox} — reads better when the control is presented as an on/off toggle. */
export const toggle = checkbox;

/** Type guard: is this node a container (panel/box)? */
export function isContainer(node: UINode): node is ContainerNode {
  return node.kind === "panel" || node.kind === "box";
}
