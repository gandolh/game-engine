import type { UINode } from "../widget/node";
import type { FocusableNode } from "./focus";
import { focusables, isFocusable } from "./focus";
import { hitTest } from "./hit-test";

/**
 * The canvas-space input dispatcher for `@engine/ui`.
 *
 * The host (a game client) owns the DOM/canvas listeners and the camera; it forwards pointer and
 * keyboard events — already in **screen pixels** — into this dispatcher, which hit-tests them
 * against the laid-out widget tree and drives interaction:
 *
 *  - hover/active state on the interactive leaves — buttons, sliders, checkboxes (never overriding
 *    `disabled`),
 *  - click activation (press + release on the same leaf → button `onActivate()` / checkbox
 *    `toggle()`); a press/drag on a slider sets its value from the pointer x,
 *  - keyboard focus traversal (Tab/Shift-Tab); Enter/Space activate the focused button/checkbox;
 *    arrow keys nudge a focused slider,
 *  - a generic drag hook (press → move → release with the originating node + screen delta), which
 *    sliders ride on (the slider node owns the value↔pixel mapping, so the dispatcher stays
 *    game-agnostic — it just routes the pointer x to the node).
 *
 * It is **game-agnostic**: it never touches the DOM, the camera, or any game state — only the
 * tree and the coordinates/keys the host hands it. Each event entry point reports whether the UI
 * **consumed** the event so the host can intercept-before-world (see {@link InputDispatcher}).
 *
 * The tree is supplied lazily via `getRoot()` so the host can rebuild/replace its UI between
 * frames; the dispatcher re-resolves the current root on every call and never retains it. Node
 * *identity* (the stable numeric `id`) is what it tracks across calls (hovered/active/focused),
 * so a node surviving a rebuild keeps its interaction state.
 */

/** Logical pointer buttons. `"primary"` is the left mouse button — the only one that activates. */
export type PointerButton = "primary" | "secondary" | "auxiliary";

/** Result of a pointer/key event: did the UI consume it (so the host should not also act)? */
export interface ConsumeResult {
  /** True if the event landed on / was handled by the UI. The host should not fall through. */
  consumed: boolean;
}

/** A drag in progress, reported to {@link InputDispatcherOptions.onDrag}. */
export interface DragEvent {
  /** Lifecycle phase of this drag callback. */
  phase: "start" | "move" | "end";
  /** The node the drag started on (the hit target under the press point). */
  node: UINode;
  /** Current pointer position in screen px. */
  x: number;
  y: number;
  /** Pointer position where the press began, in screen px. */
  startX: number;
  startY: number;
  /** Screen-space delta from the press point (`x - startX`, `y - startY`). */
  dx: number;
  dy: number;
}

/** A normalized keyboard event — the host adapts its `KeyboardEvent` (or synthetic) to this. */
export interface UIKeyEvent {
  /** The `KeyboardEvent.key` value, e.g. `"Tab"`, `"Enter"`, `" "`, `"Escape"`. */
  key: string;
  /** Whether Shift was held (used for Shift-Tab reverse traversal). */
  shiftKey?: boolean;
}

export interface InputDispatcherOptions {
  /**
   * Optional drag hook. Called once with `"start"` when the pointer moves after a press on a
   * hittable node, on every subsequent `"move"`, and once with `"end"` on release. Enough to
   * wire sliders/scrollbars later; the dispatcher itself stays drag-agnostic.
   */
  onDrag?: (e: DragEvent) => void;
  /**
   * Pixels the pointer must move from the press point before a drag is recognized. Below this,
   * a press+release still counts as a click. Default `0` (any movement starts a drag, but a
   * release without movement is still a click).
   */
  dragThreshold?: number;
}

/** The dispatcher's public surface. Every pointer/key method returns whether the UI consumed it. */
export interface InputDispatcher {
  /** Pointer moved to (x,y). Updates hover; drives drag `move` if a drag is active. */
  pointerMove(x: number, y: number, button?: PointerButton): ConsumeResult;
  /** Pointer pressed at (x,y). Sets `active`, focuses the hit button, arms click/drag tracking. */
  pointerDown(x: number, y: number, button?: PointerButton): ConsumeResult;
  /** Pointer released at (x,y). Fires `onActivate` on a same-node click; ends any drag. */
  pointerUp(x: number, y: number, button?: PointerButton): ConsumeResult;
  /** Wheel scrolled by `dy` at (x,y). Consumed iff the point is over a hittable node. */
  wheel(x: number, y: number, dy: number): ConsumeResult;
  /** A keyboard event. Tab/Shift-Tab move focus; Enter/Space activate the focused button. */
  key(evt: UIKeyEvent): ConsumeResult;

  /** Set focus to a node (by node or id), or clear it (no arg / unfocusable target). */
  focus(target?: UINode | number): void;
  /** Clear focus. */
  blur(): void;
  /** The currently focused interactive leaf (button/slider/checkbox), or `null`. */
  focused(): FocusableNode | null;

  /** Topmost hittable node under (x,y), or `null`. Pure — does not mutate state. */
  hitTest(x: number, y: number): UINode | null;
}

const NOT_CONSUMED: ConsumeResult = { consumed: false };

/**
 * Create an input dispatcher bound to a lazily-resolved widget tree.
 *
 * @param getRoot returns the current laid-out root each call (or `null` if the UI is hidden).
 * @param opts optional drag hook + threshold.
 */
export function createInputDispatcher(
  getRoot: () => UINode | null,
  opts: InputDispatcherOptions = {},
): InputDispatcher {
  const dragThreshold = opts.dragThreshold ?? 0;
  const onDrag = opts.onDrag;

  // Tracked by identity (node ref) so state survives a tree rebuild that keeps the same node.
  // Hover/active/focus apply uniformly to every interactive leaf (button/slider/checkbox); they
  // all carry a `state: ButtonState` the dispatcher drives.
  let hovered: FocusableNode | null = null;
  let active: FocusableNode | null = null;
  let focusedNode: FocusableNode | null = null;

  // Press/drag tracking for the primary button.
  let pressNode: UINode | null = null;
  let pressX = 0;
  let pressY = 0;
  let dragging = false;

  function asFocusable(node: UINode | null): FocusableNode | null {
    return node && isFocusable(node) ? node : null;
  }

  function setHover(node: FocusableNode | null): void {
    if (hovered === node) return;
    // Restore the previously-hovered button (unless it's the pressed/active one).
    if (hovered && hovered !== active && hovered.state !== "disabled") {
      hovered.state = "normal";
    }
    hovered = node;
    if (node && node !== active && node.state !== "disabled") {
      node.state = "hover";
    }
  }

  function ht(x: number, y: number): UINode | null {
    const root = getRoot();
    return root ? hitTest(root, x, y) : null;
  }

  function pointerMove(x: number, y: number): ConsumeResult {
    const hit = ht(x, y);

    // Track an in-progress drag regardless of what we're now over. Drag *detection* (the
    // `dragging` flag + threshold) is independent of the optional `onDrag` hook: crossing the
    // threshold must suppress the click even when no `onDrag` callback is registered. The hook
    // is merely notified when present.
    if (pressNode) {
      const dx = x - pressX;
      const dy = y - pressY;
      if (!dragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
        dragging = true;
        onDrag?.({ phase: "start", node: pressNode, x, y, startX: pressX, startY: pressY, dx, dy });
      }
      if (dragging) {
        // A slider owns its value↔pixel mapping; the dispatcher just routes the pointer x to it
        // (and still fires the generic `onDrag` hook for any other draggable the host wires).
        if (pressNode.kind === "slider") pressNode.setValueFromPointerX(x);
        onDrag?.({ phase: "move", node: pressNode, x, y, startX: pressX, startY: pressY, dx, dy });
      }
    }

    setHover(asFocusable(hit));
    // A live press/drag, or a pointer over any hittable node, is ours.
    return { consumed: pressNode !== null || hit !== null };
  }

  function pointerDown(x: number, y: number, button: PointerButton = "primary"): ConsumeResult {
    const hit = ht(x, y);
    if (button !== "primary") {
      // Non-primary press: consumed iff over UI, but no activation/drag/focus change.
      return { consumed: hit !== null };
    }

    pressNode = hit;
    pressX = x;
    pressY = y;
    dragging = false;

    const leaf = asFocusable(hit);
    if (leaf && leaf.state !== "disabled") {
      active = leaf;
      leaf.state = "active";
      focusedNode = leaf; // pointer focus follows the press
      // A press on a slider jumps the value to the pointer (track-click), then drag continues it.
      if (leaf.kind === "slider") leaf.setValueFromPointerX(x);
    }
    return { consumed: hit !== null };
  }

  function pointerUp(x: number, y: number, button: PointerButton = "primary"): ConsumeResult {
    if (button !== "primary") {
      const hit = ht(x, y);
      return { consumed: hit !== null };
    }

    const startedOn = pressNode;
    const wasDragging = dragging;

    if (startedOn && onDrag && wasDragging) {
      const dx = x - pressX;
      const dy = y - pressY;
      onDrag({ phase: "end", node: startedOn, x, y, startX: pressX, startY: pressY, dx, dy });
    }

    const hit = ht(x, y);

    // Resolve the active button's resting state (hover if still over it, else normal).
    if (active) {
      const stillOver = hit === active;
      active.state = stillOver ? "hover" : "normal";
      hovered = stillOver ? active : null;
    }

    // Click = primary press + release on the *same* interactive leaf, with no drag. The action
    // depends on the kind: a button activates, a checkbox toggles. A slider has no click action —
    // its value was already set on the press (and any drag); a no-movement press is a track-jump.
    let activated = false;
    const releasedLeaf = asFocusable(hit);
    if (
      !wasDragging &&
      releasedLeaf &&
      releasedLeaf === startedOn &&
      releasedLeaf.state !== "disabled"
    ) {
      if (releasedLeaf.kind === "button") releasedLeaf.onActivate?.();
      else if (releasedLeaf.kind === "checkbox") releasedLeaf.toggle();
      activated = true;
    }

    const consumed = activated || startedOn !== null || hit !== null;
    active = null;
    pressNode = null;
    dragging = false;
    return { consumed };
  }

  function wheel(x: number, y: number, _dy: number): ConsumeResult {
    return { consumed: ht(x, y) !== null };
  }

  // Enter/Space activation, dispatched by the focused leaf's kind: button → `onActivate`,
  // checkbox → `toggle`. A slider has no activate action (arrow keys adjust it instead), so
  // Enter/Space on a focused slider is a no-op — and reported not-consumed so the host may act.
  function activateFocused(): boolean {
    if (!focusedNode || focusedNode.state === "disabled") return false;
    if (focusedNode.kind === "button") {
      focusedNode.onActivate?.();
      return true;
    }
    if (focusedNode.kind === "checkbox") {
      focusedNode.toggle();
      return true;
    }
    return false;
  }

  // Arrow keys adjust a focused slider by one step (Left/Down decrement, Right/Up increment).
  function nudgeFocused(dir: 1 | -1): boolean {
    if (focusedNode && focusedNode.kind === "slider" && focusedNode.state !== "disabled") {
      focusedNode.nudge(dir);
      return true;
    }
    return false;
  }

  function moveFocus(forward: boolean): boolean {
    const root = getRoot();
    if (!root) return false;
    const list = focusables(root);
    if (list.length === 0) return false;

    const idx = focusedNode ? list.indexOf(focusedNode) : -1;
    let next: FocusableNode;
    if (idx === -1) {
      next = forward ? list[0]! : list[list.length - 1]!;
    } else {
      const n = list.length;
      next = list[(idx + (forward ? 1 : -1) + n) % n]!;
    }
    focusedNode = next;
    return true;
  }

  function key(evt: UIKeyEvent): ConsumeResult {
    switch (evt.key) {
      case "Tab":
        return { consumed: moveFocus(!evt.shiftKey) };
      case "Enter":
      case " ":
      case "Spacebar": // legacy key value
        return { consumed: activateFocused() };
      case "ArrowRight":
      case "ArrowUp":
        return { consumed: nudgeFocused(1) };
      case "ArrowLeft":
      case "ArrowDown":
        return { consumed: nudgeFocused(-1) };
      default:
        return NOT_CONSUMED;
    }
  }

  function focus(target?: UINode | number): void {
    if (target === undefined) {
      focusedNode = null;
      return;
    }
    const root = getRoot();
    const list = root ? focusables(root) : [];
    if (typeof target === "number") {
      focusedNode = list.find((b) => b.id === target) ?? null;
    } else {
      const leaf = asFocusable(target);
      focusedNode = leaf && list.includes(leaf) ? leaf : null;
    }
  }

  function blur(): void {
    focusedNode = null;
  }

  return {
    pointerMove,
    pointerDown,
    pointerUp,
    wheel,
    key,
    focus,
    blur,
    focused: () => focusedNode,
    hitTest: ht,
  };
}
