import { createEl, applyStyles } from "./dom";
import { personalityColor } from "./colors";
import { EDG } from "@engine/core/render";

/** Structured-clone-friendly (no Maps); missing trust entries fall back to 0.5. */
export interface RelationshipMatrixData {
  /** Farmers sorted by id asc. */
  farmers: Array<{ id: number; name: string; personality: string }>;
  /** trust[fromId][toId] ∈ [0,1]. */
  trust: Record<number, Record<number, number>>;
}

// Trust bands: <0.35 hostile (EDG.red), 0.35–0.65 neutral (EDG.steel), >0.65 allied (EDG.green).
function trustColor(value: number): string {
  if (value < 0.35) return EDG.red;
  if (value > 0.65) return EDG.green;
  return EDG.steel;
}

function initial(name: string): string {
  return name.charAt(0).toUpperCase();
}

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "11px",
  padding: "6px 8px",
  boxSizing: "border-box",
  borderTop: `1px solid ${EDG.ink}`,
  // pointerEvents inherited from right-column (none); enable for hover
  pointerEvents: "auto",
};

const HEADER_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontWeight: "bold",
  fontSize: "12px",
  marginBottom: "4px",
  color: EDG.white,
  borderBottom: `1px solid ${EDG.ink}`,
  paddingBottom: "3px",
  cursor: "pointer",
  userSelect: "none",
};

const CAPTION_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "10px",
  color: EDG.steel,
  lineHeight: "1.35",
  marginBottom: "5px",
};

const LEGEND_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  gap: "10px",
  fontSize: "10px",
  color: EDG.silver,
  marginBottom: "6px",
};

const TABLE_STYLES: Partial<CSSStyleDeclaration> = {
  borderCollapse: "collapse",
  tableLayout: "fixed",
  width: "100%",
};

const HEADER_CELL_STYLES: Partial<CSSStyleDeclaration> = {
  width: "22px",
  height: "20px",
  textAlign: "center",
  padding: "1px",
  fontWeight: "bold",
  fontSize: "10px",
  overflow: "hidden",
};

const DATA_CELL_STYLES: Partial<CSSStyleDeclaration> = {
  width: "22px",
  height: "20px",
  textAlign: "center",
  fontSize: "9px",
  borderRadius: "2px",
  cursor: "default",
  padding: "1px",
};

/** A "■ label" legend chip in the given swatch color. */
function legendChip(color: string, label: string): HTMLElement {
  const chip = createEl("div", {
    style: { display: "flex", alignItems: "center", gap: "3px" },
  });
  const swatch = createEl("span", {
    style: {
      width: "9px",
      height: "9px",
      background: color,
      borderRadius: "2px",
      display: "inline-block",
      flexShrink: "0",
    },
  });
  const text = createEl("span", { text: label });
  chip.appendChild(swatch);
  chip.appendChild(text);
  return chip;
}

export class RelationshipMatrixPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private bodyEl: HTMLElement;
  private tableContainer: HTMLElement;
  private collapsed = false;
  /** Dirty guard: skip the full 441-cell rebuild + table reflow when nothing
   *  rendered has changed. Trust shifts at most per-tick and usually per-day,
   *  but update() is called every render frame (~60 Hz) — without this the
   *  panel forced a full layout+paint every frame (the dominant Tier-0 cost;
   *  see corpus/wiki/performance.md). Mirrors wealth-graph's `lastDayDrawn`. */
  private lastSignature = "";

  private chevronEl: HTMLElement;

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.headerEl = createEl("div", { style: HEADER_STYLES });
    const title = createEl("span", { text: "Relationships" });
    this.chevronEl = createEl("span", {
      text: "▾",
      style: { color: EDG.steel, fontSize: "10px" },
    });
    this.headerEl.appendChild(title);
    this.headerEl.appendChild(this.chevronEl);
    this.headerEl.addEventListener("click", () => this.toggle());

    // Everything below the header collapses together.
    this.bodyEl = createEl("div");

    const caption = createEl("div", {
      style: CAPTION_STYLES,
      text: "Who trusts whom — each row's feelings toward each column. Hover a cell for the value.",
    });

    const legend = createEl("div", { style: LEGEND_STYLES });
    legend.appendChild(legendChip(EDG.green, "ally"));
    legend.appendChild(legendChip(EDG.steel, "neutral"));
    legend.appendChild(legendChip(EDG.red, "rival"));

    this.tableContainer = createEl("div");

    this.bodyEl.appendChild(caption);
    this.bodyEl.appendChild(legend);
    this.bodyEl.appendChild(this.tableContainer);

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.bodyEl);
    parent.appendChild(this.panel);
  }

  private toggle(): void {
    this.collapsed = !this.collapsed;
    this.bodyEl.style.display = this.collapsed ? "none" : "";
    this.chevronEl.textContent = this.collapsed ? "▸" : "▾";
  }

  /** Cheap render-equivalence key: farmer identity + every trust value at the
   *  2-decimal precision the tooltip shows. ~440 iterations of integer/char
   *  concat — far below the 441-cell DOM rebuild it gates. */
  private computeSignature(
    farmers: RelationshipMatrixData["farmers"],
    trust: RelationshipMatrixData["trust"],
  ): string {
    let s = `${farmers.length}:`;
    for (const f of farmers) s += `${f.id}${initial(f.name)}${f.personality[0] ?? ""};`;
    s += "|";
    for (const from of farmers) {
      const row = trust[from.id] ?? {};
      for (const to of farmers) {
        if (from.id === to.id) continue;
        s += `${Math.round((row[to.id] ?? 0.5) * 100)},`;
      }
    }
    return s;
  }

  update(data: RelationshipMatrixData): void {
    const { farmers, trust } = data;

    const signature = this.computeSignature(farmers, trust);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    if (farmers.length === 0) {
      this.tableContainer.replaceChildren();
      return;
    }

    const table = createEl("table");
    applyStyles(table, TABLE_STYLES);

    const thead = createEl("thead");
    const headerRow = createEl("tr");

    const cornerCell = createEl("th");
    applyStyles(cornerCell, { ...HEADER_CELL_STYLES, color: EDG.steel });
    cornerCell.textContent = "";
    headerRow.appendChild(cornerCell);

    for (const toFarmer of farmers) {
      const th = createEl("th");
      applyStyles(th, {
        ...HEADER_CELL_STYLES,
        color: personalityColor(toFarmer.personality),
      });
      th.textContent = initial(toFarmer.name);
      th.title = toFarmer.name;
      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = createEl("tbody");

    for (const fromFarmer of farmers) {
      const row = createEl("tr");

      const rowLabelCell = createEl("td");
      applyStyles(rowLabelCell, {
        ...HEADER_CELL_STYLES,
        color: personalityColor(fromFarmer.personality),
        fontWeight: "bold",
      });
      rowLabelCell.textContent = initial(fromFarmer.name);
      rowLabelCell.title = fromFarmer.name;
      row.appendChild(rowLabelCell);

      for (const toFarmer of farmers) {
        const td = createEl("td");

        if (fromFarmer.id === toFarmer.id) {
          applyStyles(td, {
            ...DATA_CELL_STYLES,
            background: EDG.ink,
            color: EDG.steel,
          });
          td.textContent = "·";
        } else {
          const fromTrustRow = trust[fromFarmer.id] ?? {};
          const value = fromTrustRow[toFarmer.id] ?? 0.5;
          const bg = trustColor(value);
          applyStyles(td, {
            ...DATA_CELL_STYLES,
            background: bg,
            color: EDG.white,
          });
          td.title = `${fromFarmer.name} → ${toFarmer.name}: ${value.toFixed(2)}`;
          td.textContent = "";
        }

        row.appendChild(td);
      }

      tbody.appendChild(row);
    }

    table.appendChild(tbody);

    this.tableContainer.replaceChildren(table);
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "" : "none";
  }

  destroy(): void {
    this.panel.remove();
  }
}
