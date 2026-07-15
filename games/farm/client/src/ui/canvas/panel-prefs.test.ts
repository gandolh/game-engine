import { describe, it, expect } from "vitest";
import { createPanelPrefs } from "./panel-prefs";
import type { PanelId } from "./panel-prefs";

const ALL_IDS: PanelId[] = ["observer", "slate", "events", "relations", "wealth"];

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
  it("defaults every panel to closed with no storage", () => {
    const prefs = createPanelPrefs();
    for (const id of ALL_IDS) {
      expect(prefs.isOpen(id)).toBe(false);
    }
  });

  it("defaults every panel to closed with a fresh (empty) storage", () => {
    const storage = makeFakeStorage();
    const prefs = createPanelPrefs(storage);
    for (const id of ALL_IDS) {
      expect(prefs.isOpen(id)).toBe(false);
    }
  });

  it("set/reload round-trip: a second instance over the same storage sees saved state", () => {
    const storage = makeFakeStorage();
    const first = createPanelPrefs(storage);
    first.setOpen("wealth", true);
    first.setOpen("events", true);

    const second = createPanelPrefs(storage);
    expect(second.isOpen("wealth")).toBe(true);
    expect(second.isOpen("events")).toBe(true);
    expect(second.isOpen("observer")).toBe(false);
    expect(second.isOpen("slate")).toBe(false);
    expect(second.isOpen("relations")).toBe(false);
  });

  it("corrupt JSON in storage defaults to closed without throwing", () => {
    const storage = makeFakeStorage({ "farm.ui.panels.v1": "{not valid json" });
    const prefs = createPanelPrefs(storage);
    expect(() => {
      for (const id of ALL_IDS) {
        expect(prefs.isOpen(id)).toBe(false);
      }
    }).not.toThrow();
  });

  it("missing id in a valid stored object defaults to closed", () => {
    const storage = makeFakeStorage({ "farm.ui.panels.v1": JSON.stringify({ wealth: true }) });
    const prefs = createPanelPrefs(storage);
    expect(prefs.isOpen("wealth")).toBe(true);
    expect(prefs.isOpen("observer")).toBe(false);
  });

  it("works in-memory when storage.getItem/setItem throw", () => {
    const storage = makeThrowingStorage();
    const prefs = createPanelPrefs(storage);

    expect(() => prefs.isOpen("observer")).not.toThrow();
    expect(prefs.isOpen("observer")).toBe(false);

    expect(() => prefs.setOpen("observer", true)).not.toThrow();
    expect(prefs.isOpen("observer")).toBe(true);

    expect(() => prefs.toggle("slate")).not.toThrow();
    expect(prefs.isOpen("slate")).toBe(true);
  });

  it("toggle flips and returns the new state", () => {
    const prefs = createPanelPrefs();
    expect(prefs.toggle("relations")).toBe(true);
    expect(prefs.isOpen("relations")).toBe(true);
    expect(prefs.toggle("relations")).toBe(false);
    expect(prefs.isOpen("relations")).toBe(false);
  });

  it("setOpen persists immediately (write-through)", () => {
    const storage = makeFakeStorage();
    const prefs = createPanelPrefs(storage);
    prefs.setOpen("slate", true);
    const raw = storage.getItem("farm.ui.panels.v1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toMatchObject({ slate: true });
  });
});
