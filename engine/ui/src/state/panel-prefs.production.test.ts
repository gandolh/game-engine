/**
 * Player-data regression guard for sweep-09's promotion of `panel-prefs` into `@engine/ui`.
 *
 * `panel-prefs.test.ts` beside this file covers the store's BEHAVIOUR with generic ids. This
 * file covers the thing that breaks real players: the two PRODUCTION configurations. Farm and
 * Citadel each had their own copy of this store before the promotion, each with its own
 * `localStorage` key and its own default rule, and a saved layout has to survive the move.
 *
 * Two halves, because either one alone can pass while the contract is broken:
 *
 *  1. **Behaviour** — a blob written by the PRE-promotion code must restore identically. Farm's
 *     old `isOpen` was `load()[id] === true`, so an id absent from the blob read as closed;
 *     Citadel's was `stored === undefined ? PANEL_DEFAULTS[id] : stored`, so absent meant its
 *     configured default. Both readings are asserted here against literal blobs.
 *  2. **Drift** — the literals below are a COPY of what the two game modules pass, so they could
 *     silently stop matching, and then this file would happily test a configuration nothing
 *     ships. That half CANNOT live here: `@engine/ui` is browser-scoped and carries no Node
 *     types, by design. It lives in
 *     `engine/core/src/panel-storage-keys.test.ts`, beside the repo's other disk-scanning
 *     guards. If you change a key, both files must change.
 *
 * Changing either key is a player-visible data migration, never a refactor.
 */
import { describe, it, expect } from "vitest";
import { createPanelPrefs } from "./index";

/** Mirrors `games/farm/client/src/main/panels.ts`. */
const FARM_KEY = "farm.ui.panels.v1";
const FARM_IDS = ["observer", "slate", "events", "relations", "wealth", "column"] as const;
type FarmPanelId = (typeof FARM_IDS)[number];

/** Mirrors `games/citadel/client/src/main/hud-panels.ts`. */
const CITADEL_KEY = "citadel.ui.panels.v1";
const CITADEL_IDS = ["status"] as const;
const CITADEL_DEFAULTS: Record<"status", boolean> = { status: true };

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, v); },
  } as Storage;
}

function farmPrefs(storage: Storage) {
  return createPanelPrefs<FarmPanelId>({ storageKey: FARM_KEY, ids: FARM_IDS, storage });
}

function citadelPrefs(storage: Storage) {
  return createPanelPrefs<"status">({
    storageKey: CITADEL_KEY,
    ids: CITADEL_IDS,
    defaults: CITADEL_DEFAULTS,
    storage,
  });
}

describe("production panel-prefs — a pre-promotion saved layout still restores", () => {
  it("Farm: restores the saved ids, and ids absent from the blob stay closed", () => {
    // A blob the pre-promotion Farm build could have written: three ids recorded, three never
    // touched. The three it never wrote must read closed, which is what `=== true` used to give.
    const prefs = farmPrefs(
      fakeStorage({ [FARM_KEY]: JSON.stringify({ wealth: true, events: true, observer: false }) }),
    );
    expect(prefs.isOpen("wealth")).toBe(true);
    expect(prefs.isOpen("events")).toBe(true);
    expect(prefs.isOpen("observer")).toBe(false);
    expect(prefs.isOpen("slate")).toBe(false);
    expect(prefs.isOpen("relations")).toBe(false);
    expect(prefs.isOpen("column")).toBe(false);
  });

  it("Farm: every shipped panel defaults CLOSED — the gained per-id-defaults capability is unused", () => {
    const prefs = farmPrefs(fakeStorage());
    for (const id of FARM_IDS) {
      expect(prefs.isOpen(id), `Farm panel "${id}" must ship closed`).toBe(false);
    }
  });

  it("Citadel: status ships OPEN on a fresh install", () => {
    expect(citadelPrefs(fakeStorage()).isOpen("status")).toBe(true);
  });

  it("Citadel: a stored `false` beats the open default — a player who closed it keeps it closed", () => {
    const prefs = citadelPrefs(fakeStorage({ [CITADEL_KEY]: JSON.stringify({ status: false }) }));
    expect(prefs.isOpen("status")).toBe(false);
  });

  it("writes land under the same key a pre-promotion build would read back", () => {
    const storage = fakeStorage();
    farmPrefs(storage).setOpen("wealth", true);
    const raw = storage.getItem(FARM_KEY);
    expect(raw, `nothing was written under "${FARM_KEY}"`).not.toBeNull();
    expect(JSON.parse(raw ?? "{}")).toMatchObject({ wealth: true });
  });

  it("a corrupt blob degrades to defaults rather than throwing", () => {
    expect(citadelPrefs(fakeStorage({ [CITADEL_KEY]: "{not json" })).isOpen("status")).toBe(true);
  });
});
