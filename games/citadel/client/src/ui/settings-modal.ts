/**
 * Citadel — Settings modal, rendered IN-CANVAS via `@engine/ui` (replacing the old DOM
 * overlay + its CSS in index.html). Part of the "all GUI in-game" DOM-overlay removal.
 *
 * The modal is a retained `@engine/ui` tree built ONCE: a centred `panel` dialog holding a
 * header (title + Close button), a row of tab `button`s (Display / Atmosphere / Simulation),
 * and the SELECTED tab's content panel. Selecting a tab swaps which content panel is the
 * dialog's last child (the other panels are kept but not in the rendered tree), so only one
 * shows at a time. The host lays the tree out at a computed screen centre, renders it, and
 * reconciles its a11y mirror each frame; it wires ONE input dispatcher + ONE a11y mirror to
 * `root`, exactly like the build bar. Render/input only — no sim, no determinism impact.
 *
 * Controls, all native `@engine/ui` widgets (theme-coloured, so EDG-clean with no colour
 * literals here except the value label which uses EDG.*):
 *   - Display:    a `slider` bound to camera zoom + a value label ("1.4x") updated on change,
 *                 plus a "Mute sound" `checkbox` (brief 19, Chunk C) bound to cfg.audioMuted.
 *   - Atmosphere: one `checkbox` per render toggle (label = toggle.label, bound to get/set).
 *   - Simulation: speed `button`s (1x / 2x / 4x) calling cfg.setSpeed(n).
 *
 * `show()` resyncs every control from live state (checkbox.checked = toggle.get(),
 * slider.value = getZoom(), value-label text) by MUTATING node props; the host then
 * re-layouts + re-renders + reconciles the mirror. Escape-to-close is the host's global
 * handler (it calls close() when isOpen()); the in-modal Close button also calls close().
 *
 * NOTE on search: the old DOM modal had a live `<input type=search>` filter. `@engine/ui`
 * has NO text-input widget (out of scope to add one), so the live search box is DROPPED.
 * The pure `matchesSearch` helper stays exported (its unit tests depend on it) for any
 * future search affordance, but the modal no longer wires a search field.
 *
 * The pure helpers (matchesSearch, nextTabIndex) are exported so they can be unit-tested
 * headlessly without a renderer.
 */
import { CITADEL_PAL as EDG } from "../render/citadel-palette";
import { panel, box, label, button, slider, checkbox } from "@engine/ui";
import type {
  ContainerNode,
  LabelNode,
  ButtonNode,
  SliderNode,
  CheckboxNode,
} from "@engine/ui";

// ---------------------------------------------------------------------------
// Pure logic (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Does a settings row match a search query?  Case-insensitive substring match
 * against the row's label text and its space-separated keyword list. An empty
 * (or whitespace-only) query matches everything.
 *
 * Retained for unit tests / a potential future search affordance — the in-canvas
 * modal no longer wires a live search field (no text-input widget in @engine/ui).
 */
export function matchesSearch(
  query: string,
  label: string,
  keywords: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const haystack = `${label} ${keywords}`.toLowerCase();
  return haystack.includes(q);
}

/** Arrow/Home/End key handling for a roving-tabindex tablist. */
export type TabNavKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End";

/**
 * Given the current selected tab index, a key, and the tab count, return the
 * index the selection should move to. Left/Up step back, Right/Down step
 * forward, both WRAPPING around the ends; Home → first, End → last. Returns the
 * current index unchanged for counts < 1.
 */
export function nextTabIndex(
  current: number,
  key: TabNavKey,
  count: number,
): number {
  if (count <= 0) return current;
  switch (key) {
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
  }
}

// ---------------------------------------------------------------------------
// Modal config types
// ---------------------------------------------------------------------------

/** A single boolean render toggle (Atmosphere tab). */
export interface ToggleSpec {
  readonly id: string;
  readonly label: string;
  readonly keywords: string;
  readonly get: () => boolean;
  readonly set: (v: boolean) => void;
}

/** Callbacks/getters-setters the modal needs from main.ts (keeps wiring thin). */
export interface SettingsModalConfig {
  readonly toggles: readonly ToggleSpec[];
  /** Apply a sim speed (1/2/4×) — wraps client.setSpeed. */
  readonly setSpeed: (n: number) => void;
  readonly getZoom: () => number;
  /** Apply a clamped zoom to the camera. */
  readonly setZoom: (z: number) => void;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Audio mute (brief 19, Chunk C) — wraps CitadelAudio.muted. */
  readonly audioMuted: { readonly get: () => boolean; readonly set: (v: boolean) => void };
}

interface TabDef {
  readonly id: string;
  readonly label: string;
}

const TABS: readonly TabDef[] = [
  { id: "display", label: "Display" },
  { id: "atmosphere", label: "Atmosphere" },
  { id: "speed", label: "Simulation" },
];

/** Width (px) given to the zoom slider — a value range has no intrinsic width. */
const ZOOM_SLIDER_WIDTH = 160;

/** Format a zoom value as a short label, e.g. 1.4 → "1.4x". */
function zoomLabelText(z: number): string {
  return `${z.toFixed(1)}x`;
}

// ---------------------------------------------------------------------------
// SettingsModal — builds + manages the retained @engine/ui modal tree
// ---------------------------------------------------------------------------

export class SettingsModal {
  private readonly cfg: SettingsModalConfig;

  /** The dialog root — the host lays it out (centred), renders it, and wires a dispatcher + a11y mirror to it. */
  readonly root: ContainerNode;

  private readonly tabButtons: ButtonNode[] = [];
  /** Each tab's content panel (kept built; only the selected one is in the tree). */
  private readonly tabPanels: ContainerNode[] = [];
  /** Atmosphere checkboxes, keyed by toggle id, for show()-time resync. */
  private readonly toggleBoxes = new Map<string, CheckboxNode>();
  private readonly zoomSlider: SliderNode;
  private readonly zoomValueLabel: LabelNode;
  private readonly muteCheckbox: CheckboxNode;

  private selected = 0;
  private open = false;

  constructor(cfg: SettingsModalConfig) {
    this.cfg = cfg;

    // --- Display tab: zoom slider + live value label ---------------------
    this.zoomValueLabel = label(zoomLabelText(cfg.getZoom()), { color: EDG.cyan });
    this.zoomSlider = slider({
      min: cfg.minZoom,
      max: cfg.maxZoom,
      value: cfg.getZoom(),
      step: 0.1,
      layout: { width: ZOOM_SLIDER_WIDTH },
      onChange: (z) => {
        cfg.setZoom(z);
        this.zoomValueLabel.text = zoomLabelText(cfg.getZoom());
      },
    });
    this.muteCheckbox = checkbox({
      checked: cfg.audioMuted.get(),
      label: "Mute sound",
      onChange: (v) => cfg.audioMuted.set(v),
    });
    const displayPanel = box({ direction: "column", gap: 8, align: "start" }, [
      label("Zoom level", { muted: true }),
      box({ direction: "row", gap: 8, align: "center" }, [this.zoomSlider, this.zoomValueLabel]),
      this.muteCheckbox,
    ]);

    // --- Atmosphere tab: one checkbox per render toggle ------------------
    const atmosphereRows: CheckboxNode[] = cfg.toggles.map((t) => {
      const cb = checkbox({
        checked: t.get(),
        label: t.label,
        onChange: (v) => t.set(v),
      });
      this.toggleBoxes.set(t.id, cb);
      return cb;
    });
    const atmospherePanel = box({ direction: "column", gap: 6, align: "start" }, atmosphereRows);

    // --- Simulation tab: speed buttons -----------------------------------
    const speedButtons: ButtonNode[] = [1, 2, 4].map((n) =>
      button(`${n}x`, { onActivate: () => cfg.setSpeed(n) }),
    );
    const speedPanel = box({ direction: "column", gap: 8, align: "start" }, [
      label("Simulation speed", { muted: true }),
      box({ direction: "row", gap: 6, align: "center" }, speedButtons),
    ]);

    this.tabPanels.push(displayPanel, atmospherePanel, speedPanel);

    // --- Header: title + Close button ------------------------------------
    const title = label("Settings");
    const closeBtn = button("Close", { onActivate: () => this.close() });
    const header = box({ direction: "row", gap: 16, align: "center" }, [title, closeBtn]);

    // --- Tab button row --------------------------------------------------
    TABS.forEach((tab, i) => {
      const b = button(tab.label, { onActivate: () => this.selectTab(i) });
      this.tabButtons.push(b);
    });
    const tabRow = box({ direction: "row", gap: 6, align: "center" }, [...this.tabButtons]);

    // --- Dialog: header + tab row + active content panel -----------------
    // The 3rd child is swapped by selectTab to switch tabs (only the selected
    // panel is ever in the tree, so only it lays out + renders).
    this.root = panel({ direction: "column", gap: 12, align: "stretch" }, [
      header,
      tabRow,
      this.tabPanels[0]!,
    ]);

    this.selectTab(0);
  }

  // -------------------------------------------------------------------------
  // Tab selection (visibility = swap which panel is the dialog's 3rd child)
  // -------------------------------------------------------------------------

  /** Select a tab: mark its button active and swap its content panel into the tree. */
  selectTab(index: number): void {
    this.selected = index;
    this.tabButtons.forEach((b, i) => {
      // disabled wins elsewhere, but tabs are never disabled — active = selected.
      b.state = i === index ? "active" : "normal";
    });
    const activePanel = this.tabPanels[index];
    if (activePanel !== undefined) this.root.children[2] = activePanel;
  }

  /** Currently-selected tab index (for the host's roving keyboard nav via nextTabIndex). */
  selectedTab(): number {
    return this.selected;
  }

  /** The tab buttons in order (the host can hit-test/focus these for arrow-key nav). */
  tabButtonNodes(): readonly ButtonNode[] {
    return this.tabButtons;
  }

  // -------------------------------------------------------------------------
  // State sync (called on open — mutates node props; host re-renders + reconciles)
  // -------------------------------------------------------------------------

  /** Reflect current live state into the controls (called by show()). */
  private syncFromState(): void {
    for (const t of this.cfg.toggles) {
      const cb = this.toggleBoxes.get(t.id);
      if (cb !== undefined) cb.checked = t.get();
    }
    const z = this.cfg.getZoom();
    this.zoomSlider.value = z;
    this.zoomValueLabel.text = zoomLabelText(z);
    this.muteCheckbox.checked = this.cfg.audioMuted.get();
  }

  // -------------------------------------------------------------------------
  // Open / close
  // -------------------------------------------------------------------------

  isOpen(): boolean {
    return this.open;
  }

  /**
   * Open the modal, resyncing every control from live state. The host should follow up by
   * laying out + rendering `root` and reconciling its a11y mirror (mirror.update(root)).
   */
  show(): void {
    this.syncFromState();
    this.open = true;
  }

  close(): void {
    this.open = false;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }
}
