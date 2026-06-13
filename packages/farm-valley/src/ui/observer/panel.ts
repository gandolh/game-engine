import { createEl, setText, applyStyles } from "../dom";
import { personalityColor } from "../colors";
import { EDG } from "@engine/core/render";
import type { ObserverSnapshot, FarmerRowEls } from "./types";
import { PANEL_STYLES } from "./styles";

export class ObserverPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private weatherEl: HTMLElement;
  private forecastEl: HTMLElement;
  private farmersContainer: HTMLElement;
  private resetBtn: HTMLElement;

  private hintEl: HTMLElement;
  private onFarmerClick: ((id: number | null) => void) | null = null;
  private focusedId: number | null = null;

  private focusedName: string | null = null;

  private rowCache = new Map<number, FarmerRowEls>();

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.headerEl = createEl("div", {
      style: {
        fontWeight: "bold",
        fontSize: "14px",
        marginBottom: "6px",
        color: EDG.white,
        borderBottom: `1px solid ${EDG.ink}`,
        paddingBottom: "4px",
      },
    });

    this.resetBtn = createEl("button", {
      style: {
        display: "block",
        width: "100%",
        marginBottom: "6px",
        padding: "3px 6px",
        fontSize: "11px",
        background: EDG.black,
        color: EDG.steel,
        border: `1px solid ${EDG.ink}`,
        borderRadius: "3px",
        cursor: "pointer",
        textAlign: "left",
      },
    });
    setText(this.resetBtn, "Reset view");
    this.resetBtn.addEventListener("click", () => {
      this.focusedId = null;
      this.focusedName = null;
      this._updateRowHighlights();
      this.onFarmerClick?.(null);
    });

    this.hintEl = createEl("div", {
      style: {
        fontSize: "11px",
        color: EDG.steel,
        marginBottom: "6px",
      },
    });
    setText(this.hintEl, "Click a farmer to follow them");

    this.weatherEl = createEl("div", {
      style: { marginBottom: "4px", color: EDG.silver },
    });

    this.forecastEl = createEl("div", {
      style: { marginBottom: "8px", color: EDG.steel, fontSize: "11px" },
    });

    this.farmersContainer = createEl("div");

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.hintEl);
    this.panel.appendChild(this.resetBtn);
    this.panel.appendChild(this.weatherEl);
    this.panel.appendChild(this.forecastEl);
    this.panel.appendChild(this.farmersContainer);
    parent.appendChild(this.panel);
  }

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

    if (this.focusedId !== null) {
      const focused = snapshot.farmers.find((f) => f.id === this.focusedId);
      this.focusedName = focused?.name ?? this.focusedName;
    } else {
      this.focusedName = null;
    }
    this._updateFollowControls();

    const sorted = [...snapshot.farmers].sort((a, b) => a.id - b.id);
    const currentIds = new Set(sorted.map((f) => f.id));

    for (const [id, row] of this.rowCache) {
      if (!currentIds.has(id)) {
        row.root.remove();
        this.rowCache.delete(id);
      }
    }

    const liveChildren = this.farmersContainer.children;
    sorted.forEach((farmer, index) => {
      let row = this.rowCache.get(farmer.id);

      if (row === undefined) {
        row = this.buildFarmerRow(farmer.id);
        this.rowCache.set(farmer.id, row);
        this.farmersContainer.appendChild(row.root);
      }

      if (liveChildren[index] !== row.root) {
        this.farmersContainer.insertBefore(row.root, liveChildren[index] ?? null);
      }

      this.updateFarmerRow(row, farmer);
    });
  }

  private _updateRowHighlights(): void {
    for (const [id, row] of this.rowCache) {
      const focused = id === this.focusedId;
      applyStyles(row.root, {
        borderBottom: `1px solid ${EDG.black}`,

        outline: focused ? `2px solid ${EDG.gold}` : "",
        background: focused ? `${EDG.gold}22` : "",
        cursor: "pointer",
      });
    }
    this._updateFollowControls();
  }

  private _updateFollowControls(): void {
    if (this.focusedId !== null && this.focusedName !== null) {
      setText(this.resetBtn, `Unfollow ${this.focusedName}`);
      this.hintEl.style.display = "none";
    } else {
      setText(this.resetBtn, "Reset view");
      this.hintEl.style.display = "";
    }
  }

  private buildFarmerRow(id: number): FarmerRowEls {
    const root = createEl("div", {
      style: {
        borderBottom: `1px solid ${EDG.black}`,
        paddingBottom: "6px",
        marginBottom: "6px",
        cursor: "pointer",
      },
    });
    root.dataset["farmerId"] = String(id);

    const nameRow = createEl("div", { style: { display: "flex", gap: "6px", alignItems: "center" } });
    const name = createEl("span", { style: { fontWeight: "bold", color: EDG.white } });

    root.addEventListener("click", () => {
      if (this.focusedId === id) {
        this.focusedId = null;
        this.focusedName = null;
        this._updateRowHighlights();
        this.onFarmerClick?.(null);
      } else {
        this.focusedId = id;

        this.focusedName = name.textContent ?? null;
        this._updateRowHighlights();
        this.onFarmerClick?.(id);
      }
    });

    const personality = createEl("span", {
      style: {
        fontSize: "10px",
        borderRadius: "3px",
        padding: "1px 4px",
        color: EDG.white,
      },
    });
    nameRow.appendChild(name);
    nameRow.appendChild(personality);
    root.appendChild(nameRow);

    const gold = createEl("div", { style: { color: EDG.gold } });
    root.appendChild(gold);

    const crops = createEl("div", { style: { color: EDG.green } });
    root.appendChild(crops);

    const fsm = createEl("div", { style: { color: EDG.plum } });
    root.appendChild(fsm);

    const ap = createEl("div", { style: { color: EDG.skyBlue } });
    root.appendChild(ap);

    const region = createEl("div", { style: { color: EDG.tan } });
    region.dataset["field"] = "region";
    root.appendChild(region);

    const skills = createEl("div", { style: { color: EDG.gold, fontSize: "11px" } });
    skills.dataset["field"] = "skills";
    root.appendChild(skills);

    const why = createEl("div", {
      style: {
        marginTop: "4px",
        paddingTop: "4px",
        borderTop: `1px dashed ${EDG.ink}`,
        color: EDG.steel,
        fontSize: "11px",
        whiteSpace: "pre-line",
        display: "none",
      },
    });
    why.dataset["field"] = "why";
    const whyHeader = createEl("strong", {
      style: { display: "block", fontWeight: "bold", color: EDG.steel },
    });
    setText(whyHeader, "Why:");
    const whyBody = createEl("div");
    why.appendChild(whyHeader);
    why.appendChild(whyBody);
    root.appendChild(why);

    return { root, name, personality, gold, crops, fsm, ap, region, skills, why, whyBody };
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

    const cropStr = Object.entries(farmer.crops)
      .filter(([, qty]) => qty > 0)
      .map(([k, qty]) => `${k.slice(0, 3).toUpperCase()}:${qty}`)
      .join(" ") || "-";
    setText(row.gold, `Gold: ${farmer.gold}`);
    setText(row.crops, cropStr);
    setText(row.fsm, `State: ${farmer.fsm}`);

    const apText = farmer.apPenaltyPending
      ? `AP: ${farmer.apCurrent}/${farmer.apMax} (penalty)`
      : `AP: ${farmer.apCurrent}/${farmer.apMax}`;
    setText(row.ap, apText);

    setText(row.region, `Region: ${farmer.region}`);

    const s = farmer.skills;
    const gh = farmer.hasGreenhouse ? " [GH]" : "";
    setText(
      row.skills,
      `Skills: Fa${s.farming} Fo${s.foraging} Fi${s.fishing} Mi${s.mining}${gh}`,
    );

    if (farmer.id === this.focusedId) {
      const current = farmer.currentIntention ?? "(idle)";
      const next = farmer.nextIntention ?? "(none)";
      const reasonLines =
        farmer.reasons.length > 0
          ? farmer.reasons.map((r) => `  - ${r}`).join("\n")
          : "  (no reason)";

      setText(
        row.whyBody,
        `Now: ${current}\nNext: ${next}\n${reasonLines}`,
      );
      row.why.style.display = "";
    } else {
      if (row.why.style.display !== "none") {
        setText(row.whyBody, "");
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
