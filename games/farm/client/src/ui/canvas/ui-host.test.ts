/**
 * audit-48 — gesture ownership must always be RELEASABLE.
 *
 * `uiPressActive` is claimed on a UI-consumed `mousedown` and, before this fix, cleared only from
 * a listener bound to the CANVAS. Release outside the viewport (browser chrome, a second monitor)
 * and no `mouseup` ever reached that listener, so the flag stuck `true` — and the capture-phase
 * `mousemove` then `stopImmediatePropagation()`d every subsequent event: world hover frozen,
 * camera pan dead, the next `mouseup` swallowed too. It self-healed only on a complete
 * press-and-release back inside the canvas, which reads to the player as the game randomly
 * freezing and randomly recovering.
 *
 * These tests probe the observable symptom (does a later `mousemove` still reach the world?),
 * not the private flag.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { computeLayout, panel, button } from "@engine/ui";
import type { ContainerNode, ButtonNode } from "@engine/ui";
import type { RendererLike } from "@engine/core/render";
import { createUIHost } from "./ui-host";

function makeRenderer(): RendererLike {
  return { beginUI() {}, pushUI() {}, endUI() {}, addAtlas() {} } as unknown as RendererLike;
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
  document.body.appendChild(canvas);
  return canvas;
}

/** A one-button panel that genuinely consumes a press at (10,10) — no faked dispatcher. Returns
 * the button node too so tests can assert on its `.state` (stuck-pressed) and activation count. */
function makePanel(onActivate: () => void = () => {}): { tree: ContainerNode; btn: ButtonNode } {
  const btn = button("drag me", { layout: { width: 200, height: 60 }, onActivate });
  const tree = panel({ width: 200, height: 60 }, [btn]);
  computeLayout(tree, 0, 0);
  return { tree, btn };
}

function mouse(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
}

describe("ui-host gesture ownership survives a release outside the canvas", () => {
  let canvas: HTMLCanvasElement;
  /** True when a `mousemove` on the canvas was NOT swallowed — i.e. the world would see it. */
  let worldSawMove: boolean;

  beforeEach(() => {
    document.body.innerHTML = "";
    canvas = makeCanvas();
    worldSawMove = false;
    // Stands in for the world/camera handlers: bubble phase on the canvas, so a capture-phase
    // `stopImmediatePropagation()` from the UI host hides the event from it exactly as in the app.
    canvas.addEventListener("mousemove", () => { worldSawMove = true; });
  });

  function host(onActivate: () => void = () => {}): { h: ReturnType<typeof createUIHost>; btn: ButtonNode } {
    const h = createUIHost(makeRenderer(), canvas);
    const { tree, btn } = makePanel(onActivate);
    h.registerRoot({ getRoot: () => tree });
    return { h, btn };
  }

  it("a press consumed by the UI blocks world moves WHILE the gesture is live", () => {
    const { h } = host();
    canvas.dispatchEvent(mouse("mousedown", 10, 10));
    expect(h.isPressActive()).toBe(true);

    canvas.dispatchEvent(mouse("mousemove", 20, 20));
    expect(worldSawMove).toBe(false); // intended: the world is blocked during a real UI drag
  });

  it("press-and-release INSIDE the canvas on the same widget activates it (click fires)", () => {
    let activations = 0;
    const { h, btn } = host(() => { activations++; });

    canvas.dispatchEvent(mouse("mousedown", 10, 10));
    canvas.dispatchEvent(mouse("mouseup", 10, 10));

    expect(activations).toBe(1);
    expect(btn.state).toBe("hover"); // released while still over it — never "active"
    expect(h.isPressActive()).toBe(false);
  });

  it("releasing on the WINDOW (outside the canvas) ends the gesture and unblocks the world", () => {
    let activations = 0;
    const { h, btn } = host(() => { activations++; });
    canvas.dispatchEvent(mouse("mousedown", 10, 10));
    canvas.dispatchEvent(mouse("mousemove", 20, 20));

    // The player dragged onto the browser chrome and let go there. No mouseup reaches the canvas.
    window.dispatchEvent(mouse("mouseup", 900, 700));

    expect(h.isPressActive()).toBe(false);
    // press-and-release-OUTSIDE: no click, and nothing left rendering as pressed.
    expect(activations).toBe(0);
    expect(btn.state).toBe("normal");
    worldSawMove = false;
    canvas.dispatchEvent(mouse("mousemove", 30, 30));
    expect(worldSawMove).toBe(true); // the wedge: this was `false` before the fix
  });

  it("drag-out-then-back-in: pointer leaves the canvas mid-press without releasing, returns, and a release over the original widget still activates it", () => {
    let activations = 0;
    const { h, btn } = host(() => { activations++; });

    canvas.dispatchEvent(mouse("mousedown", 10, 10));
    expect(h.isPressActive()).toBe(true);
    // The pointer leaves the canvas element entirely — in a real browser (no capture) this means
    // the canvas simply stops receiving mousemove; nothing here should cancel the gesture (only an
    // outside mouseup or a blur does that).
    window.dispatchEvent(mouse("mousemove", 900, 700));
    expect(h.isPressActive()).toBe(true); // still live — merely leaving is not a cancel

    // The pointer comes back over the canvas and over the SAME widget, then releases there.
    canvas.dispatchEvent(mouse("mousemove", 10, 10));
    canvas.dispatchEvent(mouse("mouseup", 10, 10));

    expect(activations).toBe(1);
    expect(btn.state).toBe("hover");
    expect(h.isPressActive()).toBe(false);
  });

  it("the next world CLICK is not eaten after an outside release", () => {
    const { h } = host();
    let worldSawClick = false;
    canvas.addEventListener("click", () => { worldSawClick = true; });

    canvas.dispatchEvent(mouse("mousedown", 10, 10));
    window.dispatchEvent(mouse("mouseup", 900, 700));

    // No `click` reaches the canvas for THAT gesture (it fires on the common ancestor), so
    // ownership must not be left armed to swallow the player's next real click.
    canvas.dispatchEvent(mouse("mousedown", 400, 400));
    canvas.dispatchEvent(mouse("mouseup", 400, 400));
    canvas.dispatchEvent(mouse("click", 400, 400));
    expect(worldSawClick).toBe(true);
    expect(h.isPressActive()).toBe(false);
  });

  it("a window blur mid-drag also ends the gesture (alt-tab: no click, nothing stuck pressed)", () => {
    let activations = 0;
    const { h, btn } = host(() => { activations++; });
    canvas.dispatchEvent(mouse("mousedown", 10, 10));
    expect(h.isPressActive()).toBe(true);

    window.dispatchEvent(new Event("blur"));

    expect(h.isPressActive()).toBe(false);
    expect(activations).toBe(0);
    expect(btn.state).toBe("normal");
    worldSawMove = false;
    canvas.dispatchEvent(mouse("mousemove", 30, 30));
    expect(worldSawMove).toBe(true);
  });

  it("THE NORMAL PATH IS UNCHANGED: press + release both inside the canvas stay UI-owned", () => {
    let activations = 0;
    const { h, btn } = host(() => { activations++; });
    let worldSawClick = false;
    canvas.addEventListener("click", () => { worldSawClick = true; });

    canvas.dispatchEvent(mouse("mousedown", 10, 10));
    canvas.dispatchEvent(mouse("mouseup", 10, 10));
    canvas.dispatchEvent(mouse("click", 10, 10));

    // The window listener must NOT have pre-empted the canvas one and cleared `uiGestureWasUI`
    // before the click handler read it — that handoff is the ordering risk in this fix.
    expect(worldSawClick).toBe(false);
    expect(h.isPressActive()).toBe(false);
    expect(activations).toBe(1);
    expect(btn.state).toBe("hover");
  });

  it("a WORLD-owned press released outside the canvas leaves the world alone", () => {
    const { h } = host();
    canvas.dispatchEvent(mouse("mousedown", 500, 500)); // misses the panel
    expect(h.isPressActive()).toBe(false);

    window.dispatchEvent(mouse("mouseup", 900, 700));

    worldSawMove = false;
    canvas.dispatchEvent(mouse("mousemove", 30, 30));
    expect(worldSawMove).toBe(true);
  });

  it("a release inside the canvas is not double-handled by the window listener", () => {
    const { h } = host();
    canvas.dispatchEvent(mouse("mousedown", 10, 10));
    // In jsdom a real release inside the canvas bubbles to the window too; the containment guard
    // must make that a no-op rather than a second pointerUp dispatch.
    canvas.dispatchEvent(mouse("mouseup", 10, 10));
    expect(h.isPressActive()).toBe(false);

    canvas.dispatchEvent(mouse("click", 10, 10));
    canvas.dispatchEvent(mouse("mousedown", 10, 10));
    expect(h.isPressActive()).toBe(true); // still fully functional afterwards
  });
});
