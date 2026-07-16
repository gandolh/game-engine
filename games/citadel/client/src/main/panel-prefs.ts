/**
 * Citadel panel-preferences store — a tiny persistence helper for collapsible in-canvas HUD
 * panels, mirroring Farm Valley's `ui/canvas/panel-prefs.ts` (brief 117) one-for-one. Citadel
 * never imports Farm code (games never import each other — see CLAUDE.md), so this is a
 * from-scratch port under its own storage key, not a shared module.
 *
 * Unlike Farm (whose five panels ALL default closed), Citadel's panels can each carry their
 * own default via {@link PANEL_DEFAULTS} — see `hud-panels.ts`'s `createStatusPanel` doc for why
 * the (currently sole) "status" panel defaults OPEN.
 *
 * Open/closed state is write-through persisted to `localStorage` (or any injected `Storage`)
 * under a single JSON blob keyed by `PanelId`, so a reload restores the player's last layout.
 * Every `storage` access is wrapped in try/catch: private-mode browsers and quota-exceeded
 * errors can throw on read OR write, and this module must never crash a panel over persistence.
 * Once a throw is observed, storage is treated as broken for the rest of this instance's life
 * and all further state lives in an in-memory map only (no retrying storage on subsequent calls).
 *
 * `storage` omitted or `null` (e.g. SSR-less headless tooling, or a caller that doesn't want
 * persistence) ⇒ in-memory only, same defaults and API.
 */

export type PanelId = "status";

export interface PanelPrefs {
  isOpen(id: PanelId): boolean;
  setOpen(id: PanelId, open: boolean): void;
  /** Flip and return the NEW state. */
  toggle(id: PanelId): boolean;
}

const STORAGE_KEY = "citadel.ui.panels.v1";

const PANEL_IDS: readonly PanelId[] = ["status"];

/** Per-panel default open/closed state, used when nothing is stored yet for that id. */
const PANEL_DEFAULTS: Record<PanelId, boolean> = { status: true };

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
      const stored = load()[id];
      return stored === undefined ? PANEL_DEFAULTS[id] : stored;
    },
    setOpen(id, open) {
      const map = load();
      map[id] = open;
      save(map);
    },
    toggle(id) {
      const map = load();
      const current = map[id] === undefined ? PANEL_DEFAULTS[id] : map[id];
      const next = !current;
      map[id] = next;
      save(map);
      return next;
    },
  };
}
