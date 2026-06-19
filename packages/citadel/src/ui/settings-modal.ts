/**
 * Citadel — Settings modal (brief 25).
 *
 * UI-only. Builds a tabbed, accessible, searchable settings modal as a DOM
 * overlay and wires its controls back to the main-thread render toggles, the
 * sim-client speed, and the camera zoom via injected getters/setters.
 *
 * Lineage: tiny-world-builder's settings skill — tabbed categories grouped by
 * USER INTENT (not implementation), semantic role=tab/role=tabpanel, Arrow/
 * Home/End roving-tabindex keyboard nav, data-settings-keywords search filter,
 * mobile-responsive with internal scroll, Escape / backdrop / close-button
 * dismissal.
 *
 * No colour literals live here — the modal's chrome is styled by CSS in
 * index.html (kept on the EDG palette), so the palette guard (which scans .ts)
 * stays clean and this file imports no EDG constants.
 *
 * The pure helpers (matchesSearch, nextTabIndex) are exported so they can be
 * unit-tested headlessly without a real DOM.
 */

// ---------------------------------------------------------------------------
// Pure logic (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Does a settings row match a search query?  Case-insensitive substring match
 * against the row's label text and its space-separated keyword list. An empty
 * (or whitespace-only) query matches everything.
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

// ---------------------------------------------------------------------------
// SettingsModal — builds + manages the modal DOM
// ---------------------------------------------------------------------------

export class SettingsModal {
  private readonly cfg: SettingsModalConfig;
  private readonly root: HTMLDivElement;
  private readonly tablist: HTMLDivElement;
  private readonly searchInput: HTMLInputElement;
  private readonly tabButtons: HTMLButtonElement[] = [];
  private readonly panels: HTMLDivElement[] = [];
  private readonly rows: HTMLDivElement[] = [];
  private readonly toggleInputs = new Map<string, HTMLInputElement>();
  private readonly zoomInput: HTMLInputElement;
  private readonly zoomValue: HTMLSpanElement;
  private selected = 0;
  private open = false;

  constructor(cfg: SettingsModalConfig) {
    this.cfg = cfg;

    this.root = document.createElement("div");
    this.root.id = "settings-modal";
    this.root.className = "settings-modal";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Settings");
    this.root.hidden = true;

    const dialog = document.createElement("div");
    dialog.className = "settings-dialog";
    // Clicks inside the dialog must not bubble to the backdrop (which closes).
    dialog.addEventListener("click", (e) => e.stopPropagation());

    // Header: title + close button.
    const header = document.createElement("div");
    header.className = "settings-header";
    const title = document.createElement("h2");
    title.className = "settings-title";
    title.textContent = "Settings";
    const closeBtn = document.createElement("button");
    closeBtn.className = "settings-close";
    closeBtn.setAttribute("aria-label", "Close settings");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => this.close());
    header.append(title, closeBtn);

    // Search.
    this.searchInput = document.createElement("input");
    this.searchInput.type = "search";
    this.searchInput.className = "settings-search";
    this.searchInput.placeholder = "Search settings…";
    this.searchInput.setAttribute("aria-label", "Search settings");
    this.searchInput.addEventListener("input", () => this.applySearch());

    // Tablist.
    this.tablist = document.createElement("div");
    this.tablist.className = "settings-tablist";
    this.tablist.setAttribute("role", "tablist");
    this.tablist.setAttribute("aria-label", "Settings categories");
    this.tablist.addEventListener("keydown", (e) => this.onTablistKeydown(e));

    const panelsWrap = document.createElement("div");
    panelsWrap.className = "settings-panels";

    // Build tabs + panels.
    this.zoomInput = document.createElement("input");
    this.zoomValue = document.createElement("span");
    TABS.forEach((tab, i) => {
      const tabBtn = document.createElement("button");
      tabBtn.className = "settings-tab";
      tabBtn.setAttribute("role", "tab");
      tabBtn.id = `settings-tab-${tab.id}`;
      tabBtn.setAttribute("aria-controls", `settings-panel-${tab.id}`);
      tabBtn.textContent = tab.label;
      tabBtn.addEventListener("click", () => this.selectTab(i));
      this.tabButtons.push(tabBtn);
      this.tablist.appendChild(tabBtn);

      const panel = document.createElement("div");
      panel.className = "settings-panel";
      panel.setAttribute("role", "tabpanel");
      panel.id = `settings-panel-${tab.id}`;
      panel.setAttribute("aria-labelledby", `settings-tab-${tab.id}`);
      panel.setAttribute("tabindex", "0");
      this.buildPanelBody(tab.id, panel);
      this.panels.push(panel);
      panelsWrap.appendChild(panel);
    });

    dialog.append(header, this.searchInput, this.tablist, panelsWrap);
    this.root.appendChild(dialog);

    // Backdrop click closes.
    this.root.addEventListener("click", () => this.close());
    // Escape closes (when open). Capture on the root so it works while focus is
    // inside the dialog.
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    });

    document.body.appendChild(this.root);
    this.selectTab(0);
  }

  /** Populate a panel with its setting rows. */
  private buildPanelBody(tabId: string, panel: HTMLDivElement): void {
    if (tabId === "display") {
      // Zoom slider row.
      const row = this.makeRow("Zoom level", "zoom camera scale magnify display");
      this.zoomInput.type = "range";
      this.zoomInput.className = "settings-zoom";
      this.zoomInput.min = String(this.cfg.minZoom);
      this.zoomInput.max = String(this.cfg.maxZoom);
      this.zoomInput.step = "0.1";
      this.zoomInput.setAttribute("aria-label", "Zoom level");
      this.zoomValue.className = "settings-zoom-value";
      this.zoomInput.addEventListener("input", () => {
        const z = Number(this.zoomInput.value);
        this.cfg.setZoom(z);
        this.refreshZoom();
      });
      const control = document.createElement("div");
      control.className = "settings-control";
      control.append(this.zoomInput, this.zoomValue);
      row.appendChild(control);
      panel.appendChild(row);
      return;
    }

    if (tabId === "atmosphere") {
      for (const t of this.cfg.toggles) {
        const row = this.makeRow(t.label, t.keywords);
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "settings-checkbox";
        checkbox.id = `settings-toggle-${t.id}`;
        checkbox.addEventListener("change", () => t.set(checkbox.checked));
        // Make the whole label clickable: wrap label text in a <label for>.
        const lbl = row.querySelector(".settings-row-label") as HTMLElement;
        lbl.setAttribute("for", checkbox.id);
        (lbl as HTMLLabelElement).htmlFor = checkbox.id;
        this.toggleInputs.set(t.id, checkbox);
        row.appendChild(checkbox);
        panel.appendChild(row);
      }
      return;
    }

    if (tabId === "speed") {
      const row = this.makeRow("Simulation speed", "speed fast slow 1x 2x 4x simulation tick");
      const group = document.createElement("div");
      group.className = "settings-speed-group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Simulation speed");
      for (const n of [1, 2, 4]) {
        const b = document.createElement("button");
        b.className = "settings-speed-btn";
        b.textContent = `${n}x`;
        b.addEventListener("click", () => this.cfg.setSpeed(n));
        group.appendChild(b);
      }
      row.appendChild(group);
      panel.appendChild(row);
      return;
    }
  }

  /** Build a settings row carrying searchable label + keyword metadata. */
  private makeRow(label: string, keywords: string): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.dataset.settingsKeywords = keywords;
    // Use a <label> element so checkbox rows can wire `for`.
    const lbl = document.createElement("label");
    lbl.className = "settings-row-label";
    lbl.textContent = label;
    row.appendChild(lbl);
    this.rows.push(row);
    return row;
  }

  // -------------------------------------------------------------------------
  // Tab selection + keyboard nav (roving tabindex)
  // -------------------------------------------------------------------------

  private selectTab(index: number): void {
    this.selected = index;
    this.tabButtons.forEach((btn, i) => {
      const isSel = i === index;
      btn.setAttribute("aria-selected", isSel ? "true" : "false");
      btn.tabIndex = isSel ? 0 : -1;
      btn.classList.toggle("selected", isSel);
    });
    this.panels.forEach((p, i) => {
      p.hidden = i !== index;
    });
  }

  private onTablistKeydown(e: KeyboardEvent): void {
    const navKeys: readonly string[] = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ];
    if (!navKeys.includes(e.key)) return;
    e.preventDefault();
    const next = nextTabIndex(this.selected, e.key as TabNavKey, this.tabButtons.length);
    this.selectTab(next);
    this.tabButtons[next]?.focus();
  }

  // -------------------------------------------------------------------------
  // Search filter
  // -------------------------------------------------------------------------

  private applySearch(): void {
    const q = this.searchInput.value;
    for (const row of this.rows) {
      const label = row.querySelector(".settings-row-label")?.textContent ?? "";
      const keywords = row.dataset.settingsKeywords ?? "";
      row.hidden = !matchesSearch(q, label, keywords);
    }
  }

  // -------------------------------------------------------------------------
  // State sync
  // -------------------------------------------------------------------------

  private refreshZoom(): void {
    const z = this.cfg.getZoom();
    this.zoomInput.value = String(z);
    this.zoomValue.textContent = `${z.toFixed(1)}×`;
  }

  /** Reflect current live state into the controls (called on open). */
  private syncFromState(): void {
    for (const [id, checkbox] of this.toggleInputs) {
      const spec = this.cfg.toggles.find((t) => t.id === id);
      if (spec !== undefined) checkbox.checked = spec.get();
    }
    this.refreshZoom();
  }

  // -------------------------------------------------------------------------
  // Open / close
  // -------------------------------------------------------------------------

  isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.syncFromState();
    this.applySearch();
    this.root.hidden = false;
    this.open = true;
    this.tabButtons[this.selected]?.focus();
  }

  close(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.open = false;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }
}
