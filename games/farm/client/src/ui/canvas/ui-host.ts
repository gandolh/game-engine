/**
 * Farm Valley in-canvas UI host — the shared `@engine/ui` plumbing for the Farm client.
 *
 * This is the foundation the "render ALL Farm UI in-canvas" work builds on (chunk 1). It owns:
 *  - a single {@link UISurface} over the game renderer (the screen-space UI draw seam),
 *  - an ORDERED list of UI roots, each with its own {@link InputDispatcher} + optional a11y
 *    mirror (Citadel's per-root pattern — one dispatcher/mirror per panel so their Tab orders
 *    and click-consumption stay independent),
 *  - the CAPTURE-PHASE mouse/wheel/key listeners on the canvas that give the UI first dibs on
 *    every gesture before the world's own (bubble-phase) handlers act.
 *
 * ## Coordinates
 * The UISurface + `computeLayout` work in CSS **logical** px (canvas-relative, top-left origin) —
 * the same space the renderer's UI seam uses, NOT device px. `eventToCssPx` converts a mouse
 * event with `clientX/Y − rect.left/top` and does NOT multiply by devicePixelRatio.
 *
 * ## Gesture ownership (pointer "capture")
 * The OWNER of a pointer gesture is decided at PRESS, not per-event. `uiPressActive` is true while
 * a gesture whose mousedown the UI consumed is in flight; it (not a per-event hit-test) decides
 * whether the world is blocked for that gesture's move/up/click. This copies Citadel's fix for pan
 * stutter / lost drags / release-point mis-routing (see citadel `main.ts` ~293-410).
 *
 * ## Extensibility
 * Later chunks register their own panels via {@link UIHost.registerRoot}, which wires a dispatcher
 * (fed the panel's live-or-null root) and, when a mount is given, an a11y mirror with a focus
 * bridge. The host forwards every canvas pointer/key event to ALL registered dispatchers in order
 * and treats the gesture as UI-owned if ANY consumed it. A root whose `getRoot()` returns `null`
 * (a hidden/closed panel) is inert — its dispatcher reports `consumed: false`.
 *
 * EDG32: this module emits NO colours (it only wires plumbing); panels own their palette.
 */
import { UISurface, createInputDispatcher, createA11yMirror } from "@engine/ui";
import type { InputDispatcher, A11yMirror, UINode } from "@engine/ui";
import type { RendererLike } from "@engine/core";

/** A registered UI root: its live tree source + its dispatcher/mirror + a11y mount bookkeeping. */
export interface UIRootHandle {
  /** Returns the current laid-out root each frame, or `null` while the panel is hidden/closed. */
  readonly getRoot: () => UINode | null;
  /** The canvas-space input dispatcher bound to this root (inert while `getRoot()` is null). */
  readonly dispatcher: InputDispatcher;
  /** The hidden-DOM a11y mirror for this root, or `null` if no mount was supplied. */
  readonly mirror: A11yMirror | null;
  /** The a11y mount element (used by the keydown guard to detect DOM focus inside it), or `null`. */
  readonly a11yMount: HTMLElement | null;
}

/** Options for {@link UIHost.registerRoot}. */
export interface RegisterRootOptions {
  /** Returns the current laid-out root each frame, or `null` while hidden/closed. */
  getRoot: () => UINode | null;
  /** Optional hidden-DOM a11y mount. When present, an {@link A11yMirror} is created + focus-bridged. */
  a11yMount?: HTMLElement | null;
  /** Accessible landmark label for the a11y mirror (ignored without a mount). */
  a11yLabel?: string;
}

/**
 * The in-canvas UI host. Create ONE per client (in boot, after the renderer + font atlas exist),
 * register panels into it, and drive its per-frame surface begin/end around the panels' render.
 */
export interface UIHost {
  /** The shared screen-space UI surface — wrap panel `renderTree` calls between begin()/end(). */
  readonly surface: UISurface;
  /**
   * Register a UI root. Wires an {@link InputDispatcher} over `getRoot` and, when `a11yMount` is
   * given, an {@link A11yMirror} with the focus bridge. The root joins the ordered dispatch list
   * (registration order = event-forwarding + ownership-resolution order). Returns its handle so
   * the caller can drive `mirror.update` / `mirror.setFocus`.
   */
  registerRoot(opts: RegisterRootOptions): UIRootHandle;
  /** Every registered root, in registration order. */
  readonly roots: readonly UIRootHandle[];
  /** Whether a UI-owned pointer gesture is currently in flight (press → release). */
  isPressActive(): boolean;
}

/** Map a mouse event to canvas-relative CSS-logical px (NO devicePixelRatio multiply). */
function eventToCssPx(canvas: HTMLCanvasElement, e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** Logical pointer button for the dispatcher (only `primary`/left activates). */
function pointerButtonOf(e: MouseEvent): "primary" | "secondary" | "auxiliary" {
  return e.button === 2 ? "secondary" : e.button === 1 ? "auxiliary" : "primary";
}

/**
 * Create the in-canvas UI host over `renderer`, attaching the capture-phase input listeners to
 * `canvas`. The listeners run in capture phase so they precede the world's bubble-phase handlers;
 * when the UI consumes an event they `stopImmediatePropagation()` so the world never also acts.
 */
export function createUIHost(renderer: RendererLike, canvas: HTMLCanvasElement): UIHost {
  const surface = new UISurface(renderer);
  const roots: UIRootHandle[] = [];

  // Gesture ownership: decided at PRESS (see module doc). `uiPressActive` is live between a
  // UI-consumed mousedown and its mouseup; `uiGestureWasUI` carries that ownership to the
  // click that fires just after mouseup (so we suppress the world click only for UI gestures).
  let uiPressActive = false;
  let uiGestureWasUI = false;
  // Last pointer position in canvas CSS px — the only coordinates available to a release that
  // arrives without one (a window blur mid-drag).
  let lastPointerX = 0;
  let lastPointerY = 0;

  /** After a focus-moving event, mirror each root's dispatcher focus into its a11y DOM. */
  function syncFocusToMirrors(): void {
    for (const r of roots) r.mirror?.setFocus(r.dispatcher.focused()?.id ?? null);
  }

  canvas.addEventListener(
    "mousedown",
    (e) => {
      if (roots.length === 0) return;
      const { x, y } = eventToCssPx(canvas, e);
      const btn = pointerButtonOf(e);
      let consumed = false;
      // Forward to every root (inert while its getRoot() is null); the gesture is UI-owned if ANY
      // consumed the press.
      for (const r of roots) {
        if (r.dispatcher.pointerDown(x, y, btn).consumed) consumed = true;
      }
      if (consumed) {
        uiPressActive = true;
        e.stopImmediatePropagation();
        syncFocusToMirrors();
      }
    },
    { capture: true },
  );

  canvas.addEventListener(
    "mouseup",
    (e) => {
      if (roots.length === 0) return;
      const { x, y } = eventToCssPx(canvas, e);
      const btn = pointerButtonOf(e);
      // Always forward so a UI-owned press completes/activates, but only block the world when the
      // UI owns this gesture. A world-owned release — even over a panel — must reach the world.
      for (const r of roots) r.dispatcher.pointerUp(x, y, btn);
      if (uiPressActive) e.stopImmediatePropagation();
      // click fires after mouseup; capture ownership now (cleared on next mousedown), so a stray
      // click without a press can't inherit stale ownership.
      uiGestureWasUI = uiPressActive;
      uiPressActive = false;
    },
    { capture: true },
  );

  canvas.addEventListener(
    "mousemove",
    (e) => {
      if (roots.length === 0) return;
      const { x, y } = eventToCssPx(canvas, e);
      const btn = pointerButtonOf(e);
      // Always forward so hover visuals update; only block the world (pan/drag) while the UI owns
      // the active gesture. Mere hover must NOT block world pan/drag.
      lastPointerX = x;
      lastPointerY = y;
      for (const r of roots) r.dispatcher.pointerMove(x, y, btn);
      if (uiPressActive) e.stopImmediatePropagation();
    },
    { capture: true },
  );

  // audit-48 — THE INVARIANT: a gesture that can START must always be able to END.
  //
  // The canvas-bound `mouseup` above only fires when the release lands on the canvas. Press a
  // slider, drag onto the browser chrome or a second monitor, release there, and `uiPressActive`
  // stays `true` forever — from then on the capture-phase `mousemove` stopImmediatePropagation()s
  // every event, so world hover, camera drag and pan all go dead until a full press+release back
  // inside the canvas happens to clear it. To the player the game simply stops responding.
  //
  // Farm's own camera drag already solved this three files over (`main/camera.ts` releases on
  // `window`); this brings the UI host in line. The capture-phase canvas listener keeps owning
  // DISPATCH — this is only about ownership-clearing.
  //
  // ORDERING: the window listener is BUBBLE phase, so for a release inside the canvas the canvas
  // capture listener has already run and set `uiGestureWasUI`. When it owned the gesture it also
  // called stopImmediatePropagation(), so the event never even reaches here. The containment guard
  // makes that independent of the propagation detail rather than reliant on it.
  const hostWindow = canvas.ownerDocument.defaultView ?? window;

  function endGestureOutsideCanvas(x: number, y: number, btn: "primary" | "secondary" | "auxiliary"): void {
    if (!uiPressActive) return;
    // Complete the gesture in the UI so a slider/drag settles rather than sticking mid-drag.
    for (const r of roots) r.dispatcher.pointerUp(x, y, btn);
    uiPressActive = false;
    // No `click` will reach the canvas for this gesture: a click fires on the nearest common
    // ancestor of the press and release targets, which is not the canvas when the release landed
    // outside it. So there is nothing to suppress, and leaving ownership set would instead eat the
    // player's NEXT legitimate world click.
    uiGestureWasUI = false;
  }

  hostWindow.addEventListener("mouseup", (e) => {
    if (roots.length === 0) return;
    const target = e.target;
    // Released inside the canvas → the capture-phase listener above already did the bookkeeping.
    if (target instanceof Node && (target === canvas || canvas.contains(target))) return;
    const { x, y } = eventToCssPx(canvas, e);
    endGestureOutsideCanvas(x, y, pointerButtonOf(e));
  });

  // Belt and braces: focus can be lost mid-drag with no mouseup delivered anywhere (Alt-Tab, a
  // native context menu, an OS-level window switch). Twin of audit-47's keyboard reset.
  hostWindow.addEventListener("blur", () => {
    if (roots.length === 0) return;
    endGestureOutsideCanvas(lastPointerX, lastPointerY, "primary");
  });

  canvas.addEventListener(
    "click",
    (e) => {
      if (roots.length === 0) return;
      // Activation already happened on mouseup. Suppress the world `click` only when this gesture's
      // initiating mousedown was UI-consumed.
      if (uiGestureWasUI) e.stopImmediatePropagation();
      uiGestureWasUI = false;
    },
    { capture: true },
  );

  canvas.addEventListener(
    "wheel",
    (e) => {
      if (roots.length === 0) return;
      const { x, y } = eventToCssPx(canvas, e);
      let consumed = false;
      for (const r of roots) {
        if (r.dispatcher.wheel(x, y, e.deltaY).consumed) consumed = true;
      }
      if (consumed) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true, passive: false },
  );

  // Keyboard: the UI consumes Tab (focus traversal) + Enter/Space (activate focused control) when
  // a UI widget is focused, so world key handlers don't double-fire. Runs in capture so it precedes
  // the window-level world keydown listeners. When a real mirror control already holds DOM focus,
  // native Tab/Enter + the mirror's own listeners drive things — don't fight that, so we skip the
  // dispatcher path while focus is inside any root's a11y mount (or a text input).
  window.addEventListener(
    "keydown",
    (e) => {
      if (roots.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      if (active !== null) {
        if (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable) {
          return;
        }
        for (const r of roots) {
          if (r.a11yMount !== null && r.a11yMount.contains(active)) return;
        }
      }
      let consumed = false;
      for (const r of roots) {
        if (r.dispatcher.key({ key: e.key, shiftKey: e.shiftKey }).consumed) consumed = true;
      }
      if (consumed) {
        e.preventDefault();
        e.stopImmediatePropagation();
        syncFocusToMirrors();
      }
    },
    { capture: true },
  );

  function registerRoot(opts: RegisterRootOptions): UIRootHandle {
    const getRoot = opts.getRoot;
    const dispatcher = createInputDispatcher(getRoot);
    const a11yMount = opts.a11yMount ?? null;
    let mirror: A11yMirror | null = null;
    if (a11yMount !== null) {
      mirror = createA11yMirror(a11yMount, {
        rootLabel: opts.a11yLabel ?? "User interface",
        onFocusNode: (id) => {
          if (id === null) dispatcher.blur();
          else dispatcher.focus(id);
        },
      });
    }
    const handle: UIRootHandle = { getRoot, dispatcher, mirror, a11yMount };
    roots.push(handle);
    return handle;
  }

  return {
    surface,
    registerRoot,
    roots,
    isPressActive: () => uiPressActive,
  };
}
