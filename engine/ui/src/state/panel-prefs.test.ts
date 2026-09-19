import { describe, it, expect } from "vitest";
import { createPanelPrefs } from "./panel-prefs";

type Id = "alpha" | "beta" | "gamma";
const ALL_IDS: readonly Id[] = ["alpha", "beta", "gamma"];
const STORAGE_KEY = "test.ui.panels.v1";

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

function makeThrowingStorage(opts: { onGet?: boolean; onSet?: boolean }): Storage {
  return {
    getItem() {
      if (opts.onGet) throw new Error("private mode: getItem denied");
      return null;
    },
    setItem() {
      if (opts.onSet) throw new Error("private mode: setItem denied");
    },
    removeItem() {},
    clear() {},
    key() {
      return null;
    },
    length: 0,
  } as Storage;
}

describe("createPanelPrefs — no per-id defaults (Farm's shape)", () => {
  it("defaults every panel to closed with no storage", () => {
    const prefs = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS });
    for (const id of ALL_IDS) {
      expect(prefs.isOpen(id)).toBe(false);
    }
  });

  it("defaults every panel to closed with a fresh (empty) storage", () => {
    const storage = makeFakeStorage();
    const prefs = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage });
    for (const id of ALL_IDS) {
      expect(prefs.isOpen(id)).toBe(false);
    }
  });

  it("set/reload round-trip: a second instance over the same storage sees saved state", () => {
    const storage = makeFakeStorage();
    const first = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage });
    first.setOpen("gamma", true);
    first.setOpen("beta", true);

    const second = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage });
    expect(second.isOpen("gamma")).toBe(true);
    expect(second.isOpen("beta")).toBe(true);
    expect(second.isOpen("alpha")).toBe(false);
  });

  it("corrupt JSON in storage defaults to closed without throwing", () => {
    const storage = makeFakeStorage({ [STORAGE_KEY]: "{not valid json" });
    const prefs = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage });
    expect(() => {
      for (const id of ALL_IDS) {
        expect(prefs.isOpen(id)).toBe(false);
      }
    }).not.toThrow();
  });

  it("missing id in a valid stored object defaults to closed", () => {
    const storage = makeFakeStorage({ [STORAGE_KEY]: JSON.stringify({ gamma: true }) });
    const prefs = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage });
    expect(prefs.isOpen("gamma")).toBe(true);
    expect(prefs.isOpen("alpha")).toBe(false);
  });

  it("a stored __proto__ key is dropped by the allowlist, not copied onto the fallback map", () => {
    const storage = makeFakeStorage({
      [STORAGE_KEY]: JSON.stringify({ __proto__: { polluted: true }, alpha: true }),
    });
    const prefs = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage });
    expect(prefs.isOpen("alpha")).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("toggle flips and returns the new state", () => {
    const prefs = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS });
    expect(prefs.toggle("beta")).toBe(true);
    expect(prefs.isOpen("beta")).toBe(true);
    expect(prefs.toggle("beta")).toBe(false);
    expect(prefs.isOpen("beta")).toBe(false);
  });

  it("setOpen persists immediately (write-through)", () => {
    const storage = makeFakeStorage();
    const prefs = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage });
    prefs.setOpen("alpha", true);
    const raw = storage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toMatchObject({ alpha: true });
  });
});

describe("createPanelPrefs — per-id defaults (the capability Farm gains but must not use yet)", () => {
  it("a panel can now default OPEN — proves the capability exists", () => {
    const prefs = createPanelPrefs({
      storageKey: STORAGE_KEY,
      ids: ALL_IDS,
      defaults: { alpha: true },
    });
    expect(prefs.isOpen("alpha")).toBe(true);
    // Ids with no entry in `defaults` still default closed.
    expect(prefs.isOpen("beta")).toBe(false);
    expect(prefs.isOpen("gamma")).toBe(false);
  });

  it("with no storage, falls back to the default (not hardcoded false)", () => {
    const prefs = createPanelPrefs({
      storageKey: STORAGE_KEY,
      ids: ALL_IDS,
      defaults: { alpha: true },
    });
    expect(prefs.isOpen("alpha")).toBe(true);
  });

  it("toggle flips from the configured default", () => {
    const prefs = createPanelPrefs({
      storageKey: STORAGE_KEY,
      ids: ALL_IDS,
      defaults: { alpha: true },
    });
    expect(prefs.toggle("alpha")).toBe(false); // default true -> false
    expect(prefs.toggle("alpha")).toBe(true);
  });

  it("a stored value overrides the default", () => {
    const storage = makeFakeStorage({ [STORAGE_KEY]: JSON.stringify({ alpha: false }) });
    const prefs = createPanelPrefs({
      storageKey: STORAGE_KEY,
      ids: ALL_IDS,
      defaults: { alpha: true },
      storage,
    });
    expect(prefs.isOpen("alpha")).toBe(false);
  });
});

describe("createPanelPrefs — hardening", () => {
  it("works in-memory when storage.getItem throws, and never retries storage", () => {
    const storage = makeThrowingStorage({ onGet: true });
    const prefs = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage });

    expect(() => prefs.isOpen("alpha")).not.toThrow();
    expect(prefs.isOpen("alpha")).toBe(false);

    expect(() => prefs.setOpen("alpha", true)).not.toThrow();
    expect(prefs.isOpen("alpha")).toBe(true);

    expect(() => prefs.toggle("beta")).not.toThrow();
    expect(prefs.isOpen("beta")).toBe(true);
  });

  it("works in-memory when storage.setItem throws, and never retries storage", () => {
    const storage = makeThrowingStorage({ onSet: true });
    const prefs = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage });

    expect(() => prefs.setOpen("alpha", true)).not.toThrow();
    // The in-memory fallback still reflects the set, even though storage.setItem threw.
    expect(prefs.isOpen("alpha")).toBe(true);

    expect(() => prefs.toggle("beta")).not.toThrow();
    expect(prefs.isOpen("beta")).toBe(true);
  });

  it("storage omitted or null is in-memory only, same defaults and API", () => {
    const prefsOmitted = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS });
    const prefsNull = createPanelPrefs({ storageKey: STORAGE_KEY, ids: ALL_IDS, storage: null });
    for (const prefs of [prefsOmitted, prefsNull]) {
      expect(prefs.isOpen("alpha")).toBe(false);
      expect(prefs.toggle("alpha")).toBe(true);
      expect(prefs.isOpen("alpha")).toBe(true);
    }
  });
});
