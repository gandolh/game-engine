/**
 * `chronicle-panel.ts` — the live, scrollable chronicle DOM panel (chunk
 * hollow-10b). Reads `research-store.ts`'s accumulated backlog on mount
 * (`getEvents()`), then appends ONLY new deltas as they arrive
 * (`onEvents()`) — never rebuilds the list. Formatting/categorization is
 * `chronicle-format.ts`'s job (pure, independently tested); this module is
 * the DOM glue + the category filter UI + the click -> camera-jump wiring,
 * same split as `render3d/overlay.ts` (pure helpers) vs. its draw call.
 *
 * Palette purity: every color is set via inline `style.color`/`background`/
 * `borderLeft` from a `HOLLOW_PAL.*` role, same idiom as `inspect-panel.ts`.
 */
import type { ChronicleEvent } from "@hollow/sim-core/observe";
import { HOLLOW_PAL } from "./render/hollow-palette";
import { getEvents, onEvents } from "./research-store";
import {
  formatChronicleEvent,
  chronicleEventActors,
  chronicleCategory,
  CHRONICLE_CATEGORIES,
  type ChronicleCategory,
} from "./chronicle-format";

export interface ChroniclePanelOptions {
  /** Same `ticksPerDay` the worker was booted with — threaded into
   *  `formatChronicleEvent` for the `Y<year>` prefix. */
  readonly ticksPerDay: number;
  /** Fired when a chronicle row is clicked, with its PRIMARY actor id (see
   *  `chronicleEventActors`) — `main.ts` wires this to a camera jump
   *  (`app.setSelectedAgent`/`setFollow`, with a dead-actor fallback; see
   *  that file's `handleChronicleClick`). Never called for a row with no
   *  recorded actors (e.g. a pure community-formed event with an empty
   *  member list, or an unrecognized ontology). */
  onSelectAgent(agentId: number): void;
}

export interface ChroniclePanel {
  readonly el: HTMLElement;
  /** Unsubscribes from the research store — call on teardown (no caller
   *  does today; a fresh page load owns the whole app for its lifetime, same
   *  as `HollowApp.dispose`'s doc, but this exists for symmetry / future
   *  hot-reload teardown and so tests can assert "stops listening"). */
  dispose(): void;
}

const CATEGORY_LABEL: Readonly<Record<ChronicleCategory, string>> = {
  births: "Births",
  deaths: "Deaths",
  pairings: "Pairings",
  community: "Community",
  cooperation: "Cooperation",
  antagonism: "Antagonism",
  famine: "Famine/Shock",
  other: "Other",
};

const CATEGORY_COLOR_ROLE: Readonly<Record<ChronicleCategory, keyof typeof HOLLOW_PAL>> = {
  births: "green",
  deaths: "red",
  pairings: "hotPink",
  community: "skyBlue",
  cooperation: "gold",
  antagonism: "orange",
  famine: "rust",
  other: "steel",
};

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** Builds the (unattached) chronicle panel DOM tree, wired live to
 *  `research-store.ts`. Backlog events already in the store are rendered
 *  immediately; every subsequent delta is appended (never a full rebuild). */
export function createChroniclePanel(opts: ChroniclePanelOptions): ChroniclePanel {
  const root = el("div", "hollow-chronicle-panel");
  root.style.background = HOLLOW_PAL.ink;
  root.style.color = HOLLOW_PAL.cream;
  root.style.borderRight = `2px solid ${HOLLOW_PAL.navy}`;

  const header = el("h2", "hollow-chronicle-title");
  header.textContent = "Chronicle";
  header.style.color = HOLLOW_PAL.gold;
  root.appendChild(header);

  // --- category filters --------------------------------------------------
  const activeCategories = new Set<ChronicleCategory>(CHRONICLE_CATEGORIES);
  const filterBar = el("div", "hollow-chronicle-filters");
  const chipByCategory = new Map<ChronicleCategory, HTMLButtonElement>();

  function paintChip(category: ChronicleCategory): void {
    const chip = chipByCategory.get(category);
    if (!chip) return;
    const active = activeCategories.has(category);
    chip.style.color = active ? HOLLOW_PAL.ink : HOLLOW_PAL.steel;
    chip.style.background = active ? HOLLOW_PAL[CATEGORY_COLOR_ROLE[category]] : HOLLOW_PAL.navy;
    chip.setAttribute("aria-pressed", String(active));
  }

  for (const category of CHRONICLE_CATEGORIES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "hollow-chronicle-chip";
    chip.textContent = CATEGORY_LABEL[category];
    chip.addEventListener("click", () => {
      if (activeCategories.has(category)) activeCategories.delete(category);
      else activeCategories.add(category);
      paintChip(category);
      refreshVisibility();
    });
    chipByCategory.set(category, chip);
    paintChip(category);
    filterBar.appendChild(chip);
  }
  root.appendChild(filterBar);

  // --- the scrollable, append-only list -----------------------------------
  const list = el("div", "hollow-chronicle-list");
  root.appendChild(list);

  const rows: { readonly el: HTMLElement; readonly category: ChronicleCategory }[] = [];

  function applyVisibility(rowEl: HTMLElement, category: ChronicleCategory): void {
    rowEl.style.display = activeCategories.has(category) ? "" : "none";
  }

  function refreshVisibility(): void {
    for (const r of rows) applyVisibility(r.el, r.category);
  }

  // Cap the LIVE DOM at the most recent `MAX_ROWS` rows. The full history
  // still lives in `research-store.ts` (and the export) — this only bounds
  // what's mounted. Without it, a long or fast-forwarded run appends tens of
  // thousands of `<div>`s (cooperation events alone fire hundreds per
  // sim-year), and the old per-event `scrollTop = scrollHeight` forced a
  // synchronous reflow on EVERY event — together, the "app freezes after a
  // minute" main-thread jam (chunk hollow-perf).
  const MAX_ROWS = 300;

  function trimToCap(): void {
    while (rows.length > MAX_ROWS) {
      const oldest = rows.shift();
      if (oldest) list.removeChild(oldest.el);
    }
  }

  /** Was the list scrolled (near) the bottom before this batch? If so we
   *  re-pin to the latest line after appending; if the user has scrolled up
   *  to read history, we leave their position alone. */
  function isPinnedToBottom(): boolean {
    return list.scrollHeight - list.scrollTop - list.clientHeight < 24;
  }

  function appendEvent(ev: ChronicleEvent): void {
    const category = chronicleCategory(ev.ontology);
    const rowEl = el("div", "hollow-chronicle-row");
    rowEl.textContent = formatChronicleEvent(ev, { ticksPerDay: opts.ticksPerDay });
    rowEl.style.color = HOLLOW_PAL.cream;
    rowEl.style.borderLeft = `3px solid ${HOLLOW_PAL[CATEGORY_COLOR_ROLE[category]]}`;
    const actors = chronicleEventActors(ev);
    const primary = actors[0];
    if (primary !== undefined) {
      rowEl.style.cursor = "pointer";
      rowEl.addEventListener("click", () => opts.onSelectAgent(primary));
    }
    rows.push({ el: rowEl, category });
    applyVisibility(rowEl, category);
    list.appendChild(rowEl);
  }

  /** Append a whole batch, trim to the row cap, then re-pin ONCE (a single
   *  reflow per batch instead of one per event). */
  function appendBatch(batch: Iterable<ChronicleEvent>): void {
    const wasPinned = isPinnedToBottom();
    for (const ev of batch) appendEvent(ev);
    trimToCap();
    if (wasPinned) list.scrollTop = list.scrollHeight;
  }

  appendBatch(getEvents());
  const unsubscribe = onEvents((delta) => appendBatch(delta));

  return {
    el: root,
    dispose(): void {
      unsubscribe();
    },
  };
}
