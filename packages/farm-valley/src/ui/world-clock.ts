import { createEl, applyStyles, setText } from "./dom";
import { phaseForFraction, dayFraction, type DayPhase } from "../systems/day-phase";
import { seasonForDay, type Season } from "../protocols/weather";

export interface WorldClockState {
  tick: number;
  ticksPerDay: number;
  day: number;
}

const PHASE_LABEL: Record<DayPhase, string> = {
  morning: "Morning",
  work:    "Day",
  evening: "Evening",
  night:   "Night",
};

const PHASE_COLOR: Record<DayPhase, string> = {
  morning: "#f9d87a",
  work:    "#ffe0a0",
  evening: "#e08050",
  night:   "#6080c8",
};

const SEASON_COLOR: Record<Season, string> = {
  spring: "#78c878",
  summer: "#e8b840",
  autumn: "#d06820",
  winter: "#80b8e0",
};

const SEASON_ICON: Record<Season, string> = {
  spring: "✿",
  summer: "☀",
  autumn: "❧",
  winter: "❄",
};

// Converts a 0..1 day fraction to an in-world "hour" label (6am–2am cycle).
// 0.00 = 6:00 AM (morning wake), 1.00 = 6:00 AM next day.
function fractionToTimeLabel(f: number): string {
  const totalMinutes = Math.floor(f * 20 * 60); // 20 in-game hours in a day
  const hour = (6 + Math.floor(totalMinutes / 60)) % 24;
  const min = totalMinutes % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  left: "50%",
  transform: "translateX(-50%)",
  padding: "6px 18px",
  fontFamily: "ui-monospace, monospace",
  fontSize: "13px",
  fontWeight: "bold",
  color: "#f5e9c8",
  background: "rgba(20, 18, 28, 0.88)",
  border: "1px solid rgba(201, 168, 90, 0.55)",
  borderTop: "none",
  borderRadius: "0 0 8px 8px",
  zIndex: "9998",
  pointerEvents: "none",
  display: "flex",
  gap: "10px",
  alignItems: "center",
  whiteSpace: "nowrap",
};

export class WorldClockPanel {
  private panel: HTMLElement;
  private seasonEl: HTMLElement;
  private dayEl: HTMLElement;
  private timeEl: HTMLElement;
  private phaseEl: HTMLElement;

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.seasonEl = createEl("span");
    this.dayEl    = createEl("span", { style: { color: "#d4bc88" } });
    this.timeEl   = createEl("span");
    this.phaseEl  = createEl("span", { style: { fontSize: "11px", opacity: "0.8" } });

    // Separator dots
    const dot1 = createEl("span", { style: { color: "#666", userSelect: "none" } });
    setText(dot1, "·");
    const dot2 = createEl("span", { style: { color: "#666", userSelect: "none" } });
    setText(dot2, "·");

    this.panel.appendChild(this.seasonEl);
    this.panel.appendChild(dot1);
    this.panel.appendChild(this.dayEl);
    this.panel.appendChild(dot2);
    this.panel.appendChild(this.timeEl);
    this.panel.appendChild(this.phaseEl);
    parent.appendChild(this.panel);
  }

  update(state: WorldClockState): void {
    const { tick, ticksPerDay, day } = state;
    const season = seasonForDay(day);
    const frac = dayFraction(tick, ticksPerDay);
    const phase = phaseForFraction(frac);
    const timeLabel = fractionToTimeLabel(frac);

    applyStyles(this.seasonEl, { color: SEASON_COLOR[season] });
    setText(this.seasonEl, `${SEASON_ICON[season]} ${season.charAt(0).toUpperCase() + season.slice(1)}`);

    setText(this.dayEl, `Day ${day}`);

    applyStyles(this.timeEl, { color: PHASE_COLOR[phase] });
    setText(this.timeEl, timeLabel);

    applyStyles(this.phaseEl, { color: PHASE_COLOR[phase] });
    setText(this.phaseEl, `[${PHASE_LABEL[phase]}]`);
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "flex" : "none";
  }

  destroy(): void {
    this.panel.remove();
  }
}
