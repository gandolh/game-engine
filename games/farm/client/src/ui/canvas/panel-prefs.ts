/**
 * Farm Valley panel-preferences store — a tiny persistence helper for the collapsible HUD
 * panels (observer / slate / events / relations / wealth) in `ui/canvas/`.
 *
 * Panels default to CLOSED. Open/closed state is write-through persisted to `localStorage`
 * (or any injected `Storage`) under a single JSON blob keyed by `PanelId`, so a reload restores
 * the player's last layout. Every `storage` access is wrapped in try/catch: private-mode
 * browsers and quota-exceeded errors can throw on read OR write, and this module must never
 * crash a panel over persistence. Once a throw is observed, storage is treated as broken for
 * the rest of this instance's life and all further state lives in an in-memory map only (no
 * retrying storage on subsequent calls).
 *
 * `storage` omitted or `null` (e.g. SSR-less headless tooling, or a caller that doesn't want
 * persistence) ⇒ in-memory only, same defaults and API.
 */

export type PanelId = "observer" | "slate" | "events" | "relations" | "wealth" | "column";

export interface PanelPrefs {
  isOpen(id: PanelId): boolean;
  setOpen(id: PanelId, open: boolean): void;
  /** Flip and return the NEW state. */
  toggle(id: PanelId): boolean;
}

const STORAGE_KEY = "farm.ui.panels.v1";

const PANEL_IDS: readonly PanelId[] = ["observer", "slate", "events", "relations", "wealth", "column"];

type PanelMap = Partial<Record<PanelId, boolean>>;

function readStored(storage: Storage): PanelMap {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  // Allowlist to the fixed id union with boolean values — stored JSON is external input, and
  // copying it wholesale would both admit junk keys and let a literal "__proto__" key reach
  // Object.assign's [[Set]] path (prototype pollution of the in-memory fallback map).
  const map: PanelMap = {};
  for (const id of PANEL_IDS) {
    const v = (parsed as Record<string, unknown>)[id];
    if (typeof v === "boolean") map[id] = v;
  }
  return map;
}

export function createPanelPrefs(storage?: Storage | null): PanelPrefs {
  const memory: PanelMap = {};
  let storageBroken = storage == null;

  function load(): PanelMap {
    if (storageBroken || storage == null) return memory;
    try {
      return readStored(storage);
    } catch {
      storageBroken = true;
      return memory;
    }
  }

  function save(map: PanelMap): void {
    // Always keep the in-memory fallback current, even while storage is healthy, so a
    // later write-throw doesn't silently lose the state that was just set.
    Object.assign(memory, map);
    if (storageBroken || storage == null) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      storageBroken = true;
    }
  }

  return {
    isOpen(id) {
      return load()[id] === true;
    },
    setOpen(id, open) {
      const map = load();
      map[id] = open;
      save(map);
    },
    toggle(id) {
      const map = load();
      const next = !(map[id] === true);
      map[id] = next;
      save(map);
      return next;
    },
  };
}
