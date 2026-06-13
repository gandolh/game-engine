import { createEl, setText, applyStyles } from "./dom";
import { EDG } from "@engine/core/render";

export const EVENT_FEED_PANEL_CAP = 30;

export interface EventFeedRow {
  day: number;
  text: string;

  drama?: number;

  farmerId?: number | null;
}

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

    this.applyCollapse();
  }

  private toggle(): void {
    this.collapsed = !this.collapsed;
    this.applyCollapse();
  }

  private applyCollapse(): void {
    this.linesContainer.style.display = this.collapsed ? "none" : "";
    this.chevronEl.textContent = this.collapsed ? "▸" : "▾";

    this.panel.style.flex = this.collapsed ? "0 0 auto" : "1 1 auto";
    this.panel.style.minHeight = this.collapsed ? "0" : "180px";
  }

  update(rows: ReadonlyArray<EventFeedRow>): void {
    const shown = rows.slice(-EVENT_FEED_PANEL_CAP).reverse();

    while (this.linesContainer.children.length < shown.length) {
      this.linesContainer.appendChild(this.buildLine());
    }
    while (this.linesContainer.children.length > shown.length) {
      this.linesContainer.lastChild?.remove();
    }

    shown.forEach((row, i) => {
      const lineEl = this.linesContainer.children[i] as HTMLElement;
      const isHighDrama = (row.drama ?? 0) >= 0.7;

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
