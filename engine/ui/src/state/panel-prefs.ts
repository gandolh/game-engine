/**
 * Generic, `Storage`-backed, keyed-boolean preferences store for collapsible in-canvas HUD
 * panels — promoted from two near-identical per-game copies (Farm's `ui/canvas/panel-prefs.ts`,
 * brief 117, and Citadel's `main/panel-prefs.ts`, which called itself a "from-scratch port"
 * because games never import each other — true, but that rule forbids a game -> game edge, not
 * both games importing `@engine/ui`, which they already do). See corpus decisions.md for the
 * duplicate-vs-promote rule this follows.
 *
 * Each game keeps its own `PanelId` union, its own storage key, and its own per-id defaults —
 * this module holds no game concept, only the types and values its caller supplies.
 *
 * Open/closed state is write-through persisted to the supplied `Storage` (typically
 * `localStorage`, via `safeLocalStorage()` in `./storage`) under a single JSON blob keyed by id,
 * so a reload restores the caller's last layout. Every storage access is wrapped in try/catch:
 * private-mode browsers and quota-exceeded errors can throw on read OR write, and this module
 * must never crash a panel over persistence. Once a throw is observed, storage is treated as
 * broken for the rest of this instance's life and all further state lives in an in-memory map
 * only (no retrying storage on subsequent calls).
 *
 * `storage` omitted or `null` (e.g. SSR-less headless tooling, or a caller that doesn't want
 * persistence) ⇒ in-memory only, same defaults and API.
 */

export interface PanelPrefsConfig<Id extends string> {
  /** The `localStorage` key the JSON blob is written under — game-specific, must never change
   *  once shipped, or every returning player silently loses their saved layout. */
  storageKey: string;
  /** The fixed set of valid ids. Stored JSON is external input, so reads are allowlisted to
   *  exactly this set (see `readStored`'s `__proto__` note below). */
  ids: readonly Id[];
  /** Per-id default open/closed state, used when nothing is stored yet for that id. An id with
   *  no entry here defaults to closed (`false`). */
  defaults?: Partial<Record<Id, boolean>>;
  storage?: Storage | null;
}

export interface PanelPrefs<Id extends string> {
  isOpen(id: Id): boolean;
  setOpen(id: Id, open: boolean): void;
  /** Flip and return the NEW state. */
  toggle(id: Id): boolean;
}

type PanelMap<Id extends string> = Partial<Record<Id, boolean>>;

function readStored<Id extends string>(storage: Storage, storageKey: string, ids: readonly Id[]): PanelMap<Id> {
  const raw = storage.getItem(storageKey);
  if (raw === null) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  // Allowlist to the fixed id union with boolean values — stored JSON is external input, and
  // copying it wholesale would both admit junk keys and let a literal "__proto__" key reach
  // Object.assign's [[Set]] path (prototype pollution of the in-memory fallback map).
  const map: PanelMap<Id> = {};
  for (const id of ids) {
    const v = (parsed as Record<string, unknown>)[id];
    if (typeof v === "boolean") map[id] = v;
  }
  return map;
}

export function createPanelPrefs<Id extends string>(config: PanelPrefsConfig<Id>): PanelPrefs<Id> {
  const { storageKey, ids, defaults, storage } = config;

  function defaultFor(id: Id): boolean {
    return defaults?.[id] ?? false;
  }

  const memory: PanelMap<Id> = {};
  let storageBroken = storage == null;

  function load(): PanelMap<Id> {
    if (storageBroken || storage == null) return memory;
    try {
      return readStored(storage, storageKey, ids);
    } catch {
      storageBroken = true;
      return memory;
    }
  }

  function save(map: PanelMap<Id>): void {
    // Always keep the in-memory fallback current, even while storage is healthy, so a
    // later write-throw doesn't silently lose the state that was just set.
    Object.assign(memory, map);
    if (storageBroken || storage == null) return;
    try {
      storage.setItem(storageKey, JSON.stringify(map));
    } catch {
      storageBroken = true;
    }
  }

  return {
    isOpen(id) {
      const stored = load()[id];
      return stored === undefined ? defaultFor(id) : stored;
    },
    setOpen(id, open) {
      const map = load();
      map[id] = open;
      save(map);
    },
    toggle(id) {
      const map = load();
      const current = map[id] === undefined ? defaultFor(id) : map[id];
      const next = !current;
      map[id] = next;
      save(map);
      return next;
    },
  };
}
