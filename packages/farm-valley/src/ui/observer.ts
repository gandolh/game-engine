import { createEl, setText, applyStyles } from "./dom";

export interface ObserverSnapshot {
  day: number;
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
}

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  right: "0",
  width: "280px",
  height: "100vh",
  overflowY: "auto",
  background: "#1a1a1a",
  color: "#e0e0e0",
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px",
  boxSizing: "border-box",
  zIndex: "9999",
  borderLeft: "1px solid #333",
};

const PERSONALITY_COLORS: Record<string, string> = {
  cautious: "#4a90d9",
  bold: "#e67e22",
  social: "#2ecc71",
  default: "#9b59b6",
};

function personalityColor(p: string): string {
  return PERSONALITY_COLORS[p.toLowerCase()] ?? PERSONALITY_COLORS["default"] ?? "#9b59b6";
}

export class ObserverPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private weatherEl: HTMLElement;
  private forecastEl: HTMLElement;
  private farmersContainer: HTMLElement;

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

    this.weatherEl = createEl("div", {
      style: { marginBottom: "4px", color: "#aef" },
    });

    this.forecastEl = createEl("div", {
      style: { marginBottom: "8px", color: "#888", fontSize: "11px" },
    });

    this.farmersContainer = createEl("div");

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.weatherEl);
    this.panel.appendChild(this.forecastEl);
    this.panel.appendChild(this.farmersContainer);
    parent.appendChild(this.panel);
  }

  update(snapshot: ObserverSnapshot): void {
    setText(this.headerEl, `Day ${snapshot.day}`);
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

  private buildFarmerRow(id: number): FarmerRowEls {
    const root = createEl("div", {
      style: {
        borderBottom: "1px solid #2a2a2a",
        paddingBottom: "6px",
        marginBottom: "6px",
      },
    });
    root.dataset["farmerId"] = String(id);

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

    return { root, name, personality, gold, crops, fsm, ap };
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
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "" : "none";
  }

  destroy(): void {
    this.panel.remove();
    this.rowCache.clear();
  }
}
