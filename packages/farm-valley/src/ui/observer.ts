import { createEl, setText, applyStyles } from "./dom";
import { personalityColor } from "./colors";

export interface ObserverSnapshot {
  day: number;
  /** Current season name (brief 22 — seasons / weather arcs). */
  season: string;
  weather: { condition: string; multiplier: number };
  forecast: Array<{ condition: string; confidence: number }>;
  farmers: Array<{
    id: number;
    name: string;
    personality: string;
    gold: number;
    crops: { radish: number; wheat: number; pumpkin: number };
    fsm: string;
    apCurrent: number;
    apMax: number;
    apPenaltyPending: boolean;
    region: string;
    // brief 19 — decision rationale trace ("why"), shown for the focused farmer.
    currentIntention: string | null;
    nextIntention: string | null;
    reasons: string[];
  }>;
}

interface FarmerRowEls {
  root: HTMLElement;
  name: HTMLElement;
  personality: HTMLElement;
  gold: HTMLElement;
  crops: HTMLElement;
  fsm: HTMLElement;
  ap: HTMLElement;
  region: HTMLElement;
  // brief 19 — decision rationale ("why"); only populated for the focused farmer.
  why: HTMLElement;
}

// brief 25 — the observer is now a flex child of the shared right column
// (ui/right-column.ts), not self-anchored to the corner. It sizes to content
// up to a cap so the activity feed can flow below it; `flexShrink: 0` keeps it
// from being squeezed when the feed fills the rest of the column.
const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  width: "100%",
  maxHeight: "70vh",
  overflowY: "auto",
  flexShrink: "0",
  pointerEvents: "auto",
  background: "#1a1a1a",
  color: "#e0e0e0",
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px",
  boxSizing: "border-box",
  borderLeft: "1px solid #333",
  borderBottom: "1px solid #333",
};

export class ObserverPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private weatherEl: HTMLElement;
  private forecastEl: HTMLElement;
  private farmersContainer: HTMLElement;
  // brief-11: focus-camera
  private resetBtn: HTMLElement;
  private onFarmerClick: ((id: number | null) => void) | null = null;
  private focusedId: number | null = null;

  /** Maps farmer id -> cached row elements */
  private rowCache = new Map<number, FarmerRowEls>();

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.headerEl = createEl("div", {
      style: {
        fontWeight: "bold",
        fontSize: "14px",
        marginBottom: "6px",
        color: "#fff",
        borderBottom: "1px solid #444",
        paddingBottom: "4px",
      },
    });

    // brief-11: focus-camera — reset view button
    this.resetBtn = createEl("button", {
      style: {
        display: "block",
        width: "100%",
        marginBottom: "6px",
        padding: "3px 6px",
        fontSize: "11px",
        background: "#2a2a2a",
        color: "#aaa",
        border: "1px solid #444",
        borderRadius: "3px",
        cursor: "pointer",
        textAlign: "left",
      },
    });
    setText(this.resetBtn, "Reset view");
    this.resetBtn.addEventListener("click", () => {
      this.focusedId = null;
      this._updateRowHighlights();
      this.onFarmerClick?.(null);
    });

    this.weatherEl = createEl("div", {
      style: { marginBottom: "4px", color: "#aef" },
    });

    this.forecastEl = createEl("div", {
      style: { marginBottom: "8px", color: "#888", fontSize: "11px" },
    });

    this.farmersContainer = createEl("div");

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.resetBtn);
    this.panel.appendChild(this.weatherEl);
    this.panel.appendChild(this.forecastEl);
    this.panel.appendChild(this.farmersContainer);
    parent.appendChild(this.panel);
  }

  // brief-11: focus-camera — register click callback
  setOnFarmerClick(cb: (id: number | null) => void): void {
    this.onFarmerClick = cb;
  }

  update(snapshot: ObserverSnapshot): void {
    const seasonLabel =
      snapshot.season.length > 0
        ? snapshot.season.charAt(0).toUpperCase() + snapshot.season.slice(1)
        : "";
    setText(
      this.headerEl,
      seasonLabel.length > 0 ? `Day ${snapshot.day} — ${seasonLabel}` : `Day ${snapshot.day}`,
    );
    setText(
      this.weatherEl,
      `Weather: ${snapshot.weather.condition} (x${snapshot.weather.multiplier.toFixed(2)})`,
    );

    const forecastLines = snapshot.forecast
      .map((f) => `  ${f.condition} ~${Math.round(f.confidence * 100)}%`)
      .join("\n");
    setText(this.forecastEl, `Forecast:\n${forecastLines}`);

    // Sort farmers by id ascending
    const sorted = [...snapshot.farmers].sort((a, b) => a.id - b.id);

    // Track which ids are present
    const currentIds = new Set(sorted.map((f) => f.id));

    // Remove stale rows
    for (const [id, row] of this.rowCache) {
      if (!currentIds.has(id)) {
        row.root.remove();
        this.rowCache.delete(id);
      }
    }

    // Upsert rows in sorted order
    sorted.forEach((farmer, index) => {
      let row = this.rowCache.get(farmer.id);

      if (row === undefined) {
        row = this.buildFarmerRow(farmer.id);
        this.rowCache.set(farmer.id, row);
        this.farmersContainer.appendChild(row.root);
      }

      // Ensure DOM order matches sorted order
      const children = Array.from(this.farmersContainer.children);
      if (children[index] !== row.root) {
        this.farmersContainer.insertBefore(row.root, children[index] ?? null);
      }

      this.updateFarmerRow(row, farmer);
    });
  }

  // brief-11: focus-camera — update highlight borders on all rows
  private _updateRowHighlights(): void {
    for (const [id, row] of this.rowCache) {
      const focused = id === this.focusedId;
      applyStyles(row.root, {
        borderBottom: "1px solid #2a2a2a",
        outline: focused ? "1px solid #ffd700" : "",
        cursor: "pointer",
      });
    }
  }

  private buildFarmerRow(id: number): FarmerRowEls {
    const root = createEl("div", {
      style: {
        borderBottom: "1px solid #2a2a2a",
        paddingBottom: "6px",
        marginBottom: "6px",
        cursor: "pointer",
      },
    });
    root.dataset["farmerId"] = String(id);

    // brief-11: focus-camera — clicking a row selects/deselects focus
    root.addEventListener("click", () => {
      if (this.focusedId === id) {
        // Toggle off — same as reset
        this.focusedId = null;
        this._updateRowHighlights();
        this.onFarmerClick?.(null);
      } else {
        this.focusedId = id;
        this._updateRowHighlights();
        this.onFarmerClick?.(id);
      }
    });

    const nameRow = createEl("div", { style: { display: "flex", gap: "6px", alignItems: "center" } });
    const name = createEl("span", { style: { fontWeight: "bold", color: "#fff" } });
    const personality = createEl("span", {
      style: {
        fontSize: "10px",
        borderRadius: "3px",
        padding: "1px 4px",
        color: "#fff",
      },
    });
    nameRow.appendChild(name);
    nameRow.appendChild(personality);
    root.appendChild(nameRow);

    const gold = createEl("div", { style: { color: "#f1c40f" } });
    root.appendChild(gold);

    const crops = createEl("div", { style: { color: "#a8e6a8" } });
    root.appendChild(crops);

    const fsm = createEl("div", { style: { color: "#c8a0e0" } });
    root.appendChild(fsm);

    const ap = createEl("div", { style: { color: "#80c8f0" } });
    root.appendChild(ap);

    const region = createEl("div", { style: { color: "#d8c878" } });
    region.dataset["field"] = "region";
    root.appendChild(region);

    // brief 19 — "why" sub-element; hidden unless this row is the focused farmer.
    const why = createEl("div", {
      style: {
        marginTop: "4px",
        paddingTop: "4px",
        borderTop: "1px dashed #444",
        color: "#9fd0c0",
        fontSize: "11px",
        whiteSpace: "pre-line",
        display: "none",
      },
    });
    why.dataset["field"] = "why";
    root.appendChild(why);

    return { root, name, personality, gold, crops, fsm, ap, region, why };
  }

  private updateFarmerRow(
    row: FarmerRowEls,
    farmer: ObserverSnapshot["farmers"][number],
  ): void {
    setText(row.name, farmer.name);
    setText(row.personality, farmer.personality);
    applyStyles(row.personality, {
      background: personalityColor(farmer.personality),
    });

    const { radish, wheat, pumpkin } = farmer.crops;
    setText(row.gold, `Gold: ${farmer.gold}`);
    setText(row.crops, `R:${radish} W:${wheat} P:${pumpkin}`);
    setText(row.fsm, `State: ${farmer.fsm}`);

    const apText = farmer.apPenaltyPending
      ? `AP: ${farmer.apCurrent}/${farmer.apMax} (penalty)`
      : `AP: ${farmer.apCurrent}/${farmer.apMax}`;
    setText(row.ap, apText);

    setText(row.region, `Region: ${farmer.region}`);

    // brief 19 — render the decision "why" only for the focused farmer.
    if (farmer.id === this.focusedId) {
      const current = farmer.currentIntention ?? "(idle)";
      const next = farmer.nextIntention ?? "(none)";
      const reasonLines =
        farmer.reasons.length > 0
          ? farmer.reasons.map((r) => `  - ${r}`).join("\n")
          : "  (no reason)";
      setText(
        row.why,
        `Why:\nNow: ${current}\nNext: ${next}\n${reasonLines}`,
      );
      row.why.style.display = "";
    } else {
      // Avoid DOM churn: only touch text/display when transitioning out of focus.
      if (row.why.style.display !== "none") {
        setText(row.why, "");
        row.why.style.display = "none";
      }
    }
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "" : "none";
  }

  destroy(): void {
    this.panel.remove();
    this.rowCache.clear();
  }
}
