/**
 * RelationshipMatrixPanel — a compact N×N trust grid that renders each farmer's
 * trust toward every other farmer as a color-coded cell.
 *
 * Trust bands (from field notes + brief 37):
 *   < 0.35  → hostile  → EDG.red
 *   0.35–0.65 → neutral → EDG.steel
 *   > 0.65  → allied   → EDG.green
 *
 * Diagonal cells (self→self) are blank. Header row and column show farmer
 * initials colored by personalityColor().
 *
 * Layout pattern follows LeaderboardPanel: constructor(parent) builds the
 * panel element; update(data) renders/reconciles; setVisible(v) and destroy().
 */

import { createEl, applyStyles } from "./dom";
import { personalityColor } from "./colors";
import { EDG } from "@engine/core/render";

// ---- data shape ------------------------------------------------------------

/**
 * Data for the relationship matrix panel. Structured-clone-friendly (no Maps).
 * `trust` maps `fromId` → `toId` → trust value (baseline 0.5 for unseen peers).
 */
export interface RelationshipMatrixData {
  /** Farmers in deterministic order (sorted by id asc). */
  farmers: Array<{ id: number; name: string; personality: string }>;
  /**
   * Trust matrix: trust[fromId][toId] = value in [0,1].
   * Missing entries fall back to 0.5 (baseline).
   */
  trust: Record<number, Record<number, number>>;
}

// ---- trust band helpers ----------------------------------------------------

/**
 * Trust bands:
 *   < 0.35  → hostile  (EDG.red)
 *   0.35–0.65 → neutral (EDG.steel)
 *   > 0.65  → allied   (EDG.green)
 */
function trustColor(value: number): string {
  if (value < 0.35) return EDG.red;
  if (value > 0.65) return EDG.green;
  return EDG.steel;
}

/** Short initial label for a farmer name (first char, uppercase). */
function initial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// ---- styles ----------------------------------------------------------------

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

// ---- panel -----------------------------------------------------------------

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

  /**
   * Re-render the N×N grid from `data`. Rebuilds the table on each call
   * (the farmer count is small and the table is compact; no row-caching needed).
   */
  update(data: RelationshipMatrixData): void {
    const { farmers, trust } = data;
    if (farmers.length === 0) {
      this.tableContainer.replaceChildren();
      return;
    }

    const table = createEl("table");
    applyStyles(table, TABLE_STYLES);

    // ---- header row (column labels = "to" farmer initials) ----------------
    const thead = createEl("thead");
    const headerRow = createEl("tr");

    // Top-left corner cell: blank (row label = "from", col label = "to").
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

    // ---- body rows (row = "from" farmer) ----------------------------------
    const tbody = createEl("tbody");

    for (const fromFarmer of farmers) {
      const row = createEl("tr");

      // Row label = "from" farmer initial.
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
          // Diagonal: self → blank/inert.
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
          // Show numeric value (2 decimal places) as tooltip; cell text is empty
          // for a clean grid look.
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
