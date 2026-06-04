import { createEl, setText, applyStyles } from "./dom";
import { EDG } from "@engine/core/render";

/** Maximum lines the panel shows (newest-first). */
export const EVENT_FEED_PANEL_CAP = 30;

/** A renderable feed line. `day` drives the "Day N —" prefix. */
export interface EventFeedRow {
  day: number;
  text: string;
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
      setText(lineEl, `Day ${row.day} — ${row.text}`);
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
