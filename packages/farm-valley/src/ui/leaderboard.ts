import { createEl, setText, applyStyles } from "./dom";
import { personalityColor } from "./colors";
import { EDG } from "@engine/core/render";

export interface LeaderboardRow {
  rank: number;
  id: number;
  name: string;
  personality: string;
  gold: number;
  unsoldValue: number;
  totalValue: number;
}

interface RowEls {
  root: HTMLElement;
  rank: HTMLElement;
  name: HTMLElement;
  personality: HTMLElement;
  total: HTMLElement;
}

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  bottom: "0",
  left: "0",
  width: "220px",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px",
  boxSizing: "border-box",
  zIndex: "9999",
  borderTop: `1px solid ${EDG.black}`,
  borderRight: `1px solid ${EDG.black}`,
};

const RANK_COLORS: Record<number, string> = {
  1: EDG.gold,
  2: EDG.silver,
  3: EDG.clay,
};

function rankColor(rank: number): string {
  return RANK_COLORS[rank] ?? EDG.steel;
}

export class LeaderboardPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private rowsContainer: HTMLElement;

  private rowCache = new Map<number, RowEls>();

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
      text: "Standings",
    });

    this.rowsContainer = createEl("div");

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.rowsContainer);
    parent.appendChild(this.panel);
  }

  update(rows: LeaderboardRow[]): void {
    const currentIds = new Set(rows.map((r) => r.id));

    for (const [id, rowEls] of this.rowCache) {
      if (!currentIds.has(id)) {
        rowEls.root.remove();
        this.rowCache.delete(id);
      }
    }

    // insertBefore on an existing node is a move; live HTMLCollection stays valid.
    const liveChildren = this.rowsContainer.children;
    rows.forEach((row, index) => {
      let els = this.rowCache.get(row.id);

      if (els === undefined) {
        els = this.buildRow(row.id);
        this.rowCache.set(row.id, els);
        this.rowsContainer.appendChild(els.root);
      }

      if (liveChildren[index] !== els.root) {
        this.rowsContainer.insertBefore(els.root, liveChildren[index] ?? null);
      }

      this.updateRow(els, row);
    });
  }

  private buildRow(id: number): RowEls {
    const root = createEl("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        paddingBottom: "4px",
        marginBottom: "4px",
        borderBottom: `1px solid ${EDG.black}`,
      },
    });
    root.dataset["farmerId"] = String(id);

    const rank = createEl("span", {
      style: { fontWeight: "bold", width: "16px", textAlign: "right", flexShrink: "0" },
    });
    const name = createEl("span", {
      style: { color: EDG.white, flexGrow: "1" },
    });
    const personality = createEl("span", {
      style: {
        fontSize: "9px",
        borderRadius: "3px",
        padding: "1px 3px",
        color: EDG.white,
        flexShrink: "0",
      },
    });
    const total = createEl("span", {
      style: { color: EDG.gold, flexShrink: "0", textAlign: "right" },
    });

    root.appendChild(rank);
    root.appendChild(name);
    root.appendChild(personality);
    root.appendChild(total);

    return { root, rank, name, personality, total };
  }

  private updateRow(els: RowEls, row: LeaderboardRow): void {
    setText(els.rank, `#${row.rank}`);
    applyStyles(els.rank, { color: rankColor(row.rank) });
    setText(els.name, row.name);
    setText(els.personality, row.personality);
    applyStyles(els.personality, { background: personalityColor(row.personality) });
    setText(els.total, `${row.totalValue}g`);
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "" : "none";
  }

  destroy(): void {
    this.panel.remove();
    this.rowCache.clear();
  }
}
