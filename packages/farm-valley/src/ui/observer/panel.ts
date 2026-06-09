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
  // brief-11: focus-camera
  private resetBtn: HTMLElement;
  // discoverability: persistent dim hint shown while nothing is followed.
  private hintEl: HTMLElement;
  private onFarmerClick: ((id: number | null) => void) | null = null;
  private focusedId: number | null = null;
  /** Name of the currently focused farmer, for the dynamic Unfollow label. */
  private focusedName: string | null = null;

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
        color: EDG.white,
        borderBottom: `1px solid ${EDG.ink}`,
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

    // discoverability: a subtle, persistent hint that rows are clickable.
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

    // Keep the dynamic Unfollow label in sync with the focused farmer's name.
    if (this.focusedId !== null) {
      const focused = snapshot.farmers.find((f) => f.id === this.focusedId);
      this.focusedName = focused?.name ?? this.focusedName;
    } else {
      this.focusedName = null;
    }
    this._updateFollowControls();

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

    // Upsert rows in sorted order.
    // Read the live HTMLCollection once before the loop — no Array allocation,
    // and the reference remains valid across insertBefore calls because
    // HTMLCollection is live and always reflects the current DOM state.
    const liveChildren = this.farmersContainer.children;
    sorted.forEach((farmer, index) => {
      let row = this.rowCache.get(farmer.id);

      if (row === undefined) {
        row = this.buildFarmerRow(farmer.id);
        this.rowCache.set(farmer.id, row);
        this.farmersContainer.appendChild(row.root);
      }

      // Ensure DOM order matches sorted order — index the live HTMLCollection
      // directly to avoid allocating an Array snapshot per row per frame.
      if (liveChildren[index] !== row.root) {
        this.farmersContainer.insertBefore(row.root, liveChildren[index] ?? null);
      }

      this.updateFarmerRow(row, farmer);
    });
  }

  // brief-11: focus-camera — update highlight borders on all rows
  private _updateRowHighlights(): void {
    for (const [id, row] of this.rowCache) {
      const focused = id === this.focusedId;
      applyStyles(row.root, {
        borderBottom: `1px solid ${EDG.black}`,
        // discoverability: a stronger, more legible focus highlight — a thicker
        // gold outline plus a faint gold-tinted background (alpha-suffixed EDG
        // hex; the palette guard's regex ignores 8-digit #rrggbbaa values).
        outline: focused ? `2px solid ${EDG.gold}` : "",
        background: focused ? `${EDG.gold}22` : "",
        cursor: "pointer",
      });
    }
    this._updateFollowControls();
  }

  // discoverability: dynamic Unfollow label + hint visibility, driven by focus.
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

    // brief-11: focus-camera — clicking a row selects/deselects focus
    root.addEventListener("click", () => {
      if (this.focusedId === id) {
        // Toggle off — same as reset
        this.focusedId = null;
        this.focusedName = null;
        this._updateRowHighlights();
        this.onFarmerClick?.(null);
      } else {
        this.focusedId = id;
        // Capture the name now so the Unfollow label is correct immediately,
        // before the next update() snapshot arrives.
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

    // brief 43 — skill levels line (legibility: why a late-game farmer is productive).
    const skills = createEl("div", { style: { color: EDG.gold, fontSize: "11px" } });
    skills.dataset["field"] = "skills";
    root.appendChild(skills);

    // brief 19 — "why" sub-element; hidden unless this row is the focused farmer.
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
    // discoverability: a bold "Why:" header above the decision trace.
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

    // brief 41 — show all crop kinds with non-zero counts.
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

    // brief 43 — skill levels + greenhouse marker.
    const s = farmer.skills;
    const gh = farmer.hasGreenhouse ? " [GH]" : "";
    setText(
      row.skills,
      `Skills: Fa${s.farming} Fo${s.foraging} Fi${s.fishing} Mi${s.mining}${gh}`,
    );

    // brief 19 — render the decision "why" only for the focused farmer.
    if (farmer.id === this.focusedId) {
      const current = farmer.currentIntention ?? "(idle)";
      const next = farmer.nextIntention ?? "(none)";
      const reasonLines =
        farmer.reasons.length > 0
          ? farmer.reasons.map((r) => `  - ${r}`).join("\n")
          : "  (no reason)";
      // The bold "Why:" header is a static child; only the body text updates.
      setText(
        row.whyBody,
        `Now: ${current}\nNext: ${next}\n${reasonLines}`,
      );
      row.why.style.display = "";
    } else {
      // Avoid DOM churn: only touch text/display when transitioning out of focus.
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
