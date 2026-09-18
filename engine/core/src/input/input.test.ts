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

describe("Keyboard — focus loss releases held keys (audit-47)", () => {
  let dom: JSDOM;
  let win: Window;
  let kb: Keyboard;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><body><canvas id='c'></canvas></body>");
    win = dom.window as unknown as Window;
    kb = new Keyboard();
    kb.attach(win);
  });

  afterEach(() => {
    kb.detach();
  });

  const hold = (code: string): void => {
    (win as unknown as EventTarget).dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { code, bubbles: true }),
    );
  };
  const setHidden = (hidden: boolean): void => {
    Object.defineProperty(dom.window.document, "hidden", { value: hidden, configurable: true });
  };

  it("a key held across a window blur reads isDown === false afterwards", () => {
    hold("KeyD");
    expect(kb.isDown("KeyD")).toBe(true);
    kb.endFrame();

    // Alt-Tab: the OS delivers the keyup to the OTHER window, so no keyup arrives here.
    (win as unknown as EventTarget).dispatchEvent(new dom.window.Event("blur"));

    expect(kb.isDown("KeyD")).toBe(false);
    expect(kb.pressedKeys.size).toBe(0);
  });

  it("the blurred key appears in justReleased for exactly one frame", () => {
    hold("KeyD");
    kb.endFrame();

    (win as unknown as EventTarget).dispatchEvent(new dom.window.Event("blur"));
    // A consumer polling edge transitions must see a real release, not a key that vanished.
    expect(kb.justReleased("KeyD")).toBe(true);

    kb.endFrame();
    expect(kb.justReleased("KeyD")).toBe(false);
    expect(kb.isDown("KeyD")).toBe(false);
  });

  it("releases every held key at once, not just one", () => {
    hold("KeyW"); hold("KeyD"); hold("ShiftLeft");
    kb.endFrame();

    (win as unknown as EventTarget).dispatchEvent(new dom.window.Event("blur"));

    for (const code of ["KeyW", "KeyD", "ShiftLeft"]) {
      expect(kb.isDown(code), code).toBe(false);
      expect(kb.justReleased(code), code).toBe(true);
    }
  });

  it("visibilitychange with document.hidden === true releases held keys", () => {
    hold("KeyA");
    kb.endFrame();

    setHidden(true);
    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));

    expect(kb.isDown("KeyA")).toBe(false);
    expect(kb.justReleased("KeyA")).toBe(true);
  });

  it("visibilitychange back to VISIBLE does not clear a key held since the return", () => {
    setHidden(false);
    hold("KeyA");
    kb.endFrame();

    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));

    expect(kb.isDown("KeyA")).toBe(true);
  });

  it("pagehide releases held keys (mobile backgrounding)", () => {
    hold("KeyS");
    kb.endFrame();

    (win as unknown as EventTarget).dispatchEvent(new dom.window.Event("pagehide"));

    expect(kb.isDown("KeyS")).toBe(false);
  });

  it("keys pressed after focus returns still register normally", () => {
    hold("KeyD");
    (win as unknown as EventTarget).dispatchEvent(new dom.window.Event("blur"));
    kb.endFrame();

    hold("KeyD");
    expect(kb.isDown("KeyD")).toBe(true);
    expect(kb.justPressed("KeyD")).toBe(true);
  });

  it("an HTMLElement target still gets the window-level reset (the deliberate asymmetry)", () => {
    const el = dom.window.document.getElementById("c") as unknown as HTMLElement;
    const kb2 = new Keyboard();
    kb2.attach(el);
    try {
      (el as unknown as EventTarget).dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { code: "KeyQ", bubbles: true }),
      );
      expect(kb2.isDown("KeyQ")).toBe(true);

      // An element never receives `blur` for an Alt-Tab, so the reset must be bound to the
      // element's OWNING window — resolved via ownerDocument.defaultView, not a global.
      (win as unknown as EventTarget).dispatchEvent(new dom.window.Event("blur"));
      expect(kb2.isDown("KeyQ")).toBe(false);
    } finally {
      kb2.detach();
    }
  });

  it("detach removes every listener attach added — counted, not self-reported", () => {
    // Instrument the real hosts so a future added listener cannot leak unnoticed.
    const live = new Set<string>();
    const instrument = (host: EventTarget, tag: string): void => {
      const origAdd = host.addEventListener.bind(host);
      const origRemove = host.removeEventListener.bind(host);
      (host as EventTarget).addEventListener = (t: string, f: never, o?: never): void => {
        live.add(`${tag}:${t}:${String(live.size)}`);
        origAdd(t, f, o);
      };
      (host as EventTarget).removeEventListener = (t: string, f: never, o?: never): void => {
        for (const k of live) if (k.startsWith(`${tag}:${t}:`)) { live.delete(k); break; }
        origRemove(t, f, o);
      };
    };
    instrument(win as unknown as EventTarget, "win");
    instrument(dom.window.document as unknown as EventTarget, "doc");

    const kb2 = new Keyboard();
    kb2.attach(win);
    // keydown + keyup + blur + pagehide on the window, visibilitychange on the document.
    expect(live.size).toBe(5);
    expect(kb2.listenerCount).toBe(5);

    kb2.detach();
    expect(live.size).toBe(0);
    expect(kb2.listenerCount).toBe(0);
  });

  it("re-attaching does not double-register the focus-loss listeners", () => {
    kb.attach(win);
    kb.attach(win);
    expect(kb.listenerCount).toBe(5);

    hold("KeyD");
    kb.endFrame();
    (win as unknown as EventTarget).dispatchEvent(new dom.window.Event("blur"));
    expect(kb.isDown("KeyD")).toBe(false);
  });
});
