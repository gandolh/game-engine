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
  fontWeight: "bold",
  fontSize: "12px",
  marginBottom: "4px",
  color: EDG.white,
  borderBottom: `1px solid ${EDG.ink}`,
  paddingBottom: "3px",
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

export class RelationshipMatrixPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private tableContainer: HTMLElement;

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.headerEl = createEl("div", {
      style: HEADER_STYLES,
      text: "Relationships",
    });

    this.tableContainer = createEl("div");

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.tableContainer);
    parent.appendChild(this.panel);
  }

  update(data: RelationshipMatrixData): void {
    const { farmers, trust } = data;
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
