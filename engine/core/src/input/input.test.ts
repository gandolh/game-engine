import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { Keyboard } from "./keyboard";

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

    expect(kb.justPressed("KeyA")).toBe(true);

    kb.endFrame();
    expect(kb.justPressed("KeyA")).toBe(false);

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

    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "ShiftLeft", bubbles: true }));
    expect(kb.justPressed("ShiftLeft")).toBe(false);
  });

  it("attach/detach is idempotent — events stop after detach", () => {
    kb.detach();
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    expect(kb.isDown("KeyZ")).toBe(false);

    kb.attach(win as Window);
    kb.attach(win as Window); 
    win.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    expect(kb.isDown("KeyZ")).toBe(true);
  });
});
