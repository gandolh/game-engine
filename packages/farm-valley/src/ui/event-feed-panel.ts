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
  /** Clicking a row with a farmerId focuses the camera on that farmer. */
  farmerId?: number | null;
}

// Flows below the observer in the shared right column; takes leftover space. minHeight keeps
// it readable (~10+ lines) even when the panels below it are expanded, so it never collapses
// to a sliver the way it did under minHeight:0.
const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  width: "100%",
  flex: "1 1 auto",
  minHeight: "180px",
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
  private chevronEl: HTMLElement;
  private linesContainer: HTMLElement;
  private collapsed = true;

  private onFarmerClick: ((id: number) => void) | null = null;

  setOnFarmerClick(cb: (id: number) => void): void {
    this.onFarmerClick = cb;
  }

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.headerEl = createEl("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        fontWeight: "bold",
        fontSize: "13px",
        marginBottom: "6px",
        color: EDG.white,
        borderBottom: `1px solid ${EDG.ink}`,
        paddingBottom: "4px",
      },
    });
    const title = createEl("span", { text: "Activity" });
    this.chevronEl = createEl("span", {
      text: "▸",
      style: { color: EDG.steel, fontSize: "10px" },
    });
    this.headerEl.appendChild(title);
    this.headerEl.appendChild(this.chevronEl);
    this.headerEl.addEventListener("click", () => this.toggle());

    this.linesContainer = createEl("div");
    this.linesContainer.dataset["eventFeedLines"] = "";

    // Delegated click: data-farmer-id on a line fires onFarmerClick.
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

    // Collapsed by default; clicking the header expands it.
    this.applyCollapse();
  }

  private toggle(): void {
    this.collapsed = !this.collapsed;
    this.applyCollapse();
  }

  private applyCollapse(): void {
    this.linesContainer.style.display = this.collapsed ? "none" : "";
    this.chevronEl.textContent = this.collapsed ? "▸" : "▾";
    // When collapsed, shrink to the header instead of holding the flex/minHeight space.
    this.panel.style.flex = this.collapsed ? "0 0 auto" : "1 1 auto";
    this.panel.style.minHeight = this.collapsed ? "0" : "180px";
  }

  /** Render newest-first. rows are oldest-first; reversed and capped here. */
  update(rows: ReadonlyArray<EventFeedRow>): void {
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
      // Set color on every update so a reused DOM node toggles correctly.
      lineEl.style.color = isHighDrama ? EDG.gold : EDG.green;
      const prefix = isHighDrama ? "★ " : "";
      setText(lineEl, `${prefix}Day ${row.day} — ${row.text}`);
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
        marginBottom: "4px",
        lineHeight: "1.45",
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
