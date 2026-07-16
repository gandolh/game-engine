import { describe, it, expect } from "vitest";
import { createPanelPrefs } from "./panel-prefs";

/** Minimal fake Storage — isolated from jsdom's real localStorage, and easy to break on demand. */
function makeFakeStorage(initial?: Record<string, string>): Storage {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key() {
      return null;
    },
    get length() {
      return data.size;
    },
  } as Storage;
}

function makeThrowingStorage(): Storage {
  return {
    getItem() {
      throw new Error("private mode: getItem denied");
    },
    setItem() {
      throw new Error("private mode: setItem denied");
    },
    removeItem() {},
    clear() {},
    key() {
      return null;
    },
    length: 0,
  } as Storage;
}

describe("createPanelPrefs", () => {
  it("defaults 'status' to OPEN with no storage", () => {
    const prefs = createPanelPrefs();
    expect(prefs.isOpen("status")).toBe(true);
  });

  it("defaults 'status' to OPEN with a fresh (empty) storage", () => {
    const storage = makeFakeStorage();
    const prefs = createPanelPrefs(storage);
    expect(prefs.isOpen("status")).toBe(true);
  });

  it("set/reload round-trip: a second instance over the same storage sees saved (closed) state", () => {
    const storage = makeFakeStorage();
    const first = createPanelPrefs(storage);
    first.setOpen("status", false);

    const second = createPanelPrefs(storage);
    expect(second.isOpen("status")).toBe(false);
  });

  it("corrupt JSON in storage falls back to the default (open) without throwing", () => {
    const storage = makeFakeStorage({ "citadel.ui.panels.v1": "{not valid json" });
    const prefs = createPanelPrefs(storage);
    expect(() => expect(prefs.isOpen("status")).toBe(true)).not.toThrow();
  });

  it("a valid stored object missing the id falls back to the default (open)", () => {
    const storage = makeFakeStorage({ "citadel.ui.panels.v1": JSON.stringify({}) });
    const prefs = createPanelPrefs(storage);
    expect(prefs.isOpen("status")).toBe(true);
  });

  it("a stored __proto__ key is dropped by the allowlist, not copied onto the fallback map", () => {
    const storage = makeFakeStorage({
      "citadel.ui.panels.v1": JSON.stringify({ __proto__: { polluted: true }, status: false }),
    });
    const prefs = createPanelPrefs(storage);
    expect(prefs.isOpen("status")).toBe(false);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("works in-memory when storage.getItem/setItem throw", () => {
    const storage = makeThrowingStorage();
    const prefs = createPanelPrefs(storage);

    expect(() => prefs.isOpen("status")).not.toThrow();
    expect(prefs.isOpen("status")).toBe(true);

    expect(() => prefs.setOpen("status", false)).not.toThrow();
    expect(prefs.isOpen("status")).toBe(false);

    expect(() => prefs.toggle("status")).not.toThrow();
    expect(prefs.isOpen("status")).toBe(true);
  });

  it("toggle flips from the default and returns the new state", () => {
    const prefs = createPanelPrefs();
    expect(prefs.toggle("status")).toBe(false); // default true -> false
    expect(prefs.isOpen("status")).toBe(false);
    expect(prefs.toggle("status")).toBe(true);
    expect(prefs.isOpen("status")).toBe(true);
  });

  it("setOpen persists immediately (write-through)", () => {
    const storage = makeFakeStorage();
    const prefs = createPanelPrefs(storage);
    prefs.setOpen("status", false);
    const raw = storage.getItem("citadel.ui.panels.v1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toMatchObject({ status: false });
  });
});
