import { createEl, setText, applyStyles } from "./dom";
import { personalityColor } from "./colors";
import { EDG } from "@engine/core/render";
import { easeOutBack } from "../main/juice";

export interface LeaderboardRow {
  rank: number;
  id: number;
  name: string;
  personality: string;
  gold: number;
  unsoldValue: number;
  totalValue: number;
}

// ---------------------------------------------------------------------------
// Score-bump animation state (per farmer)
// ---------------------------------------------------------------------------

interface BumpState {
  /** Whether a bump animation is currently running. */
  active: boolean;
  /** Elapsed time in seconds since the bump started. */
  elapsed: number;
  /** Duration of the bump in seconds. */
  duration: number;
}

/** Duration of the easeOutBack scale bump (1.0 → 1.3 → 1.0). */
const BUMP_DURATION_S = 0.35;
/** Peak scale factor during the bump. */
const BUMP_PEAK_SCALE = 1.3;

interface RowEls {
  root: HTMLElement;
  rank: HTMLElement;
  name: HTMLElement;
  personality: HTMLElement;
  total: HTMLElement;
  bump: BumpState;
}

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "220px",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px",
  boxSizing: "border-box",
  zIndex: "9999",
  border: `1px solid ${EDG.black}`,
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
  private visible = true;
  /** Tracks the previous total value per farmer to detect increases. */
  private prevTotals = new Map<number, number>();
  /** Wall-clock for bump animation advancement (set each requestAnimationFrame). */
  private lastBumpTickMs = 0;

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
    const nowMs = performance.now();
    const dtSec = this.lastBumpTickMs > 0 ? Math.min((nowMs - this.lastBumpTickMs) / 1000, 0.1) : 0;
    this.lastBumpTickMs = nowMs;

    const currentIds = new Set(rows.map((r) => r.id));

    for (const [id, rowEls] of this.rowCache) {
      if (!currentIds.has(id)) {
        rowEls.root.remove();
        this.rowCache.delete(id);
        this.prevTotals.delete(id);
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

      // Score-bump: trigger when totalValue increases
      const prev = this.prevTotals.get(row.id);
      if (prev !== undefined && row.totalValue > prev) {
        els.bump.active = true;
        els.bump.elapsed = 0;
      }
      this.prevTotals.set(row.id, row.totalValue);

      // Advance bump animation
      if (els.bump.active) {
        els.bump.elapsed += dtSec;
        if (els.bump.elapsed >= els.bump.duration) {
          els.bump.active = false;
          els.bump.elapsed = 0;
          els.total.style.transform = "scale(1)";
        } else {
          const t = els.bump.elapsed / els.bump.duration;
          // easeOutBack: goes 0→1 with overshoot; map to scale 1→PEAK→1
          const easedT = easeOutBack(t);
          // Scale range: 1.0 at t=0, BUMP_PEAK_SCALE at peak, back to 1.0 at t=1
          // easeOutBack(0)=0, easeOutBack(1)=1 with overshoot in between.
          // Map: scale = 1 + (BUMP_PEAK_SCALE - 1) * (1 - |easedT - 0.5| * 2) uses a tent;
          // simpler: directly use easeOutBack for a 0→1 then back shape via a triangle:
          const bump = t < 0.5
            ? easeOutBack(t * 2) * (BUMP_PEAK_SCALE - 1)
            : (1 - (t - 0.5) * 2) * (BUMP_PEAK_SCALE - 1);
          const scale = 1 + bump;
          els.total.style.transform = `scale(${scale.toFixed(3)})`;
        }
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
      style: {
        color: EDG.gold,
        flexShrink: "0",
        textAlign: "right",
        display: "inline-block",
        transformOrigin: "right center",
      },
    });

    root.appendChild(rank);
    root.appendChild(name);
    root.appendChild(personality);
    root.appendChild(total);

    return {
      root,
      rank,
      name,
      personality,
      total,
      bump: { active: false, elapsed: 0, duration: BUMP_DURATION_S },
    };
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
    this.visible = v;
    this.panel.style.display = v ? "" : "none";
  }

  get isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  destroy(): void {
    this.panel.remove();
    this.rowCache.clear();
    this.prevTotals.clear();
  }
}
