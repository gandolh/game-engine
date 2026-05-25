import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { Keyboard } from "./keyboard";
import { Mouse } from "./mouse";
import { InputManager } from "./input-manager";

// ---------- helpers ----------

function makeWindow(): Window {
  const dom = new JSDOM("<!DOCTYPE html>");
  return dom.window as unknown as Window;
}

function makeCanvas(dom: JSDOM): HTMLCanvasElement {
  return dom.window.document.createElement("canvas") as unknown as HTMLCanvasElement;
}

// ---------- Keyboard ----------

describe("Keyboard", () => {
  let dom: JSDOM;
  let win: EventTarget;
  let kb: Keyboard;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html>");
    win = dom.window as unknown as EventTarget;
    kb = new Keyboard();
    kb.attach(win as Window);
  });

  afterEach(() => {
    kb.detach();
  });

  it("isDown reflects keydown/keyup", () => {
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
    expect(kb.isDown("KeyW")).toBe(true);

    win.dispatchEvent(new dom.window.KeyboardEvent("keyup", { code: "KeyW", bubbles: true }));
    expect(kb.isDown("KeyW")).toBe(false);
  });

  it("justPressed is true on the first tick after keydown, false after endFrame", () => {
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "KeyA", bubbles: true }));

    // First observation (same tick)
    expect(kb.justPressed("KeyA")).toBe(true);

    // After endFrame the just-set is cleared
    kb.endFrame();
    expect(kb.justPressed("KeyA")).toBe(false);

    // But isDown is still true
    expect(kb.isDown("KeyA")).toBe(true);
  });

  it("justReleased is true on the tick of keyup, false after endFrame", () => {
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "Space", bubbles: true }));
    kb.endFrame();

    win.dispatchEvent(new dom.window.KeyboardEvent("keyup", { code: "Space", bubbles: true }));
    expect(kb.justReleased("Space")).toBe(true);

    kb.endFrame();
    expect(kb.justReleased("Space")).toBe(false);
  });

  it("holding a key does not re-trigger justPressed across frames", () => {
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "ShiftLeft", bubbles: true }));
    kb.endFrame();
    // Simulate browser repeat — but code guards with !_pressed.has
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "ShiftLeft", bubbles: true }));
    expect(kb.justPressed("ShiftLeft")).toBe(false);
  });

  it("attach/detach is idempotent — events stop after detach", () => {
    kb.detach();
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    expect(kb.isDown("KeyZ")).toBe(false);

    // Re-attach and re-detach — no double-listener
    kb.attach(win as Window);
    kb.attach(win as Window); // second attach should detach first
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    expect(kb.isDown("KeyZ")).toBe(true);
  });
});

// ---------- Mouse ----------

describe("Mouse", () => {
  let dom: JSDOM;
  let canvas: EventTarget;
  let mouse: Mouse;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html>");
    canvas = dom.window.document.createElement("canvas") as unknown as EventTarget;
    mouse = new Mouse();
    mouse.attach(canvas as HTMLCanvasElement);
  });

  afterEach(() => {
    mouse.detach();
  });

  it("wheel accumulates within a frame and resets on endFrame", () => {
    canvas.dispatchEvent(new dom.window.WheelEvent("wheel", { deltaY: 100, bubbles: true }));
    canvas.dispatchEvent(new dom.window.WheelEvent("wheel", { deltaY: 50, bubbles: true }));
    expect(mouse.wheel).toBe(150);

    mouse.endFrame();
    expect(mouse.wheel).toBe(0);
  });

  it("button justPressed is true on first tick, false after endFrame", () => {
    canvas.dispatchEvent(new dom.window.PointerEvent("pointerdown", { button: 0, bubbles: true }));
    expect(mouse.justPressed(0)).toBe(true);
    expect(mouse.button(0)).toBe(true);

    mouse.endFrame();
    expect(mouse.justPressed(0)).toBe(false);
    expect(mouse.button(0)).toBe(true);
  });

  it("button justReleased is true on the tick of pointerup, false after endFrame", () => {
    canvas.dispatchEvent(new dom.window.PointerEvent("pointerdown", { button: 0, bubbles: true }));
    mouse.endFrame();

    canvas.dispatchEvent(new dom.window.PointerEvent("pointerup", { button: 0, bubbles: true }));
    expect(mouse.justReleased(0)).toBe(true);
    expect(mouse.button(0)).toBe(false);

    mouse.endFrame();
    expect(mouse.justReleased(0)).toBe(false);
  });

  it("attach/detach is idempotent — no events after detach", () => {
    mouse.detach();
    canvas.dispatchEvent(new dom.window.WheelEvent("wheel", { deltaY: 200, bubbles: true }));
    expect(mouse.wheel).toBe(0);

    // Re-attach twice — only one set of listeners
    mouse.attach(canvas as HTMLCanvasElement);
    mouse.attach(canvas as HTMLCanvasElement);
    canvas.dispatchEvent(new dom.window.WheelEvent("wheel", { deltaY: 99, bubbles: true }));
    expect(mouse.wheel).toBe(99);
  });
});

// ---------- InputManager ----------

describe("InputManager", () => {
  let dom: JSDOM;
  let canvas: HTMLCanvasElement;
  let manager: InputManager;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html>");
    canvas = dom.window.document.createElement("canvas") as unknown as HTMLCanvasElement;
    manager = new InputManager(canvas);
  });

  afterEach(() => {
    manager.keyboard.detach();
    manager.mouse.detach();
  });

  it("snapshot reflects current pressed state", () => {
    const win = dom.window as unknown as EventTarget;
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "KeyS", bubbles: true }));

    const snap = manager.snapshot();
    expect(snap.pressedKeys).toContain("KeyS");
    expect(snap.mouseWheel).toBe(0);
  });

  it("endFrame delegates to both keyboard and mouse", () => {
    const win = dom.window as unknown as EventTarget;
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "KeyD", bubbles: true }));
    const canvasTarget = canvas as unknown as EventTarget;
    canvasTarget.dispatchEvent(new dom.window.WheelEvent("wheel", { deltaY: 10, bubbles: true }));

    manager.endFrame();

    expect(manager.keyboard.justPressed("KeyD")).toBe(false);
    expect(manager.mouse.wheel).toBe(0);
  });
});
