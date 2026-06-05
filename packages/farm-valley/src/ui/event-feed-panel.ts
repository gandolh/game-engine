import { createEl, setText, applyStyles } from "./dom";
import { EDG } from "@engine/core/render";

/** Maximum lines the panel shows (newest-first). */
export const EVENT_FEED_PANEL_CAP = 30;

/** A renderable feed line. `day` drives the "Day N —" prefix. */
export interface EventFeedRow {
  day: number;
  text: string;
  /**
   * Drama score from drama.ts, [0, 1]. Optional for back-compat with code
   * that builds rows without a score (e.g. older tests). Undefined is treated
   * as 0 (routine).
   */
  drama?: number;
  /**
   * The primary farmer entity id involved in this event, or null/undefined when
   * none is identifiable. Clicking a row with a farmerId focuses the camera on
   * that farmer. Brief 40.
   */
  farmerId?: number | null;
}

// brief 25 — flows below the observer inside the shared right column
// (ui/right-column.ts). Takes the leftover vertical space (`flex: 1`) and
// scrolls internally rather than self-anchoring to the corner.
const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  width: "100%",
  flex: "1 1 auto",
  minHeight: "0",
  overflowY: "auto",
  pointerEvents: "auto",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px",
  boxSizing: "border-box",
  borderTop: `1px solid ${EDG.ink}`,
  borderLeft: `1px solid ${EDG.black}`,
};

export class EventFeedPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private linesContainer: HTMLElement;

  /** Brief 40 — called when a row with a known farmerId is clicked. */
  private onFarmerClick: ((id: number) => void) | null = null;

  setOnFarmerClick(cb: (id: number) => void): void {
    this.onFarmerClick = cb;
  }

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.headerEl = createEl("div", {
      style: {
        fontWeight: "bold",
        fontSize: "13px",
        marginBottom: "6px",
        color: EDG.white,
        borderBottom: `1px solid ${EDG.ink}`,
        paddingBottom: "4px",
      },
      text: "Activity",
    });

    this.linesContainer = createEl("div");
    this.linesContainer.dataset["eventFeedLines"] = "";

    // Brief 40 — delegated click on feed lines. If the clicked element carries a
    // data-farmer-id attribute, fire the onFarmerClick callback so the camera
    // pans to that farmer. Using event delegation avoids re-attaching listeners
    // on every update() call.
    this.linesContainer.addEventListener("click", (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const fidStr = target.dataset["farmerId"];
      if (fidStr !== undefined && this.onFarmerClick) {
        const fid = Number(fidStr);
        if (Number.isFinite(fid)) this.onFarmerClick(fid);
      }
    });

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.linesContainer);
    parent.appendChild(this.panel);
  }

  /**
   * Render the feed newest-FIRST. `rows` are expected chronological
   * (oldest-first, as the system stores them); we reverse and cap here.
   */
  update(rows: ReadonlyArray<EventFeedRow>): void {
    // Newest-first, capped.
    const shown = rows.slice(-EVENT_FEED_PANEL_CAP).reverse();

    // Reconcile DOM line count to `shown.length`.
    while (this.linesContainer.children.length < shown.length) {
      this.linesContainer.appendChild(this.buildLine());
    }
    while (this.linesContainer.children.length > shown.length) {
      this.linesContainer.lastChild?.remove();
    }

    shown.forEach((row, i) => {
      const lineEl = this.linesContainer.children[i] as HTMLElement;
      const isHighDrama = (row.drama ?? 0) >= 0.7;
      // Apply emphasis: brighter color + star prefix for high-drama rows.
      // Color is set on every update so a reused DOM node toggles correctly.
      lineEl.style.color = isHighDrama ? EDG.gold : EDG.green;
      const prefix = isHighDrama ? "★ " : "";
      setText(lineEl, `${prefix}Day ${row.day} — ${row.text}`);
      // Brief 40 — click-to-zoom: clicking a row that has a known farmerId
      // fires the onFarmerClick callback so the camera pans to that farmer.
      const fid = row.farmerId ?? null;
      if (fid !== null) {
        lineEl.style.cursor = "pointer";
        lineEl.dataset["farmerId"] = String(fid);
      } else {
        lineEl.style.cursor = "";
        delete lineEl.dataset["farmerId"];
      }
    });
  }

  private buildLine(): HTMLElement {
    return createEl("div", {
      style: {
        color: EDG.green,
        marginBottom: "3px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
    });
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "" : "none";
  }

  destroy(): void {
    this.panel.remove();
  }
}
