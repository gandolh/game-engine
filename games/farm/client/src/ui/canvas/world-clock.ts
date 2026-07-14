/**
 * Farm Valley world-clock — the top-centre day/season/time readout, rendered IN-CANVAS
 * via `@engine/ui`.
 *
 * This is the PILOT consumer that proves the `@engine/ui` framework end-to-end in the Farm
 * client (chunk 1 of "render all Farm UI in-canvas"): a retained widget tree built ONCE by
 * {@link createWorldClock}, then `refresh(state)` re-textures its labels in place each frame
 * from the latest snapshot-derived time, mirroring Citadel's `createResourceHud` pattern.
 *
 * It supersedes the old DOM `ui/world-clock.ts` panel (since deleted).
 *
 * ⚠️ Icon note: the DOM clock used non-ASCII season glyphs (✿☀❧❄). `@engine/ui`'s text stack
 * (now the authored UNSCII pixel font — see `engine/ui/src/text/fonts.ts`) still only covers
 * printable ASCII (0x20-0x7e), so this panel keeps showing the season NAME text rather than a
 * glyph the font can't render. No season/weather glyph exists in the `@engine/ui` icon set
 * ([engine/ui/src/icon/icons.ts](../../../../../../engine/ui/src/icon/icons.ts) — buildings/
 * tools/goods only) either, so there's nothing to swap the text for yet.
 *
 * EDG32-only: every colour is an `EDG.*` constant (mirrors the DOM clock's phase/season maps).
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import { phaseForFraction, dayFraction, type DayPhase } from "@farm/sim-core/systems/day-phase";
import { seasonForDay, type Season } from "@farm/sim-core/protocols/weather";

/** The live values the clock displays. Supplied each frame by the host (derived from the snapshot). */
export interface WorldClockState {
  tick: number;
  ticksPerDay: number;
  day: number;
}

const PHASE_LABEL: Record<DayPhase, string> = {
  morning: "Morning",
  work: "Day",
  evening: "Evening",
  night: "Night",
};

const PHASE_COLOR: Record<DayPhase, string> = {
  morning: EDG.yellow,
  work: EDG.cream,
  evening: EDG.clay,
  night: EDG.steel,
};

const SEASON_COLOR: Record<Season, string> = {
  spring: EDG.green,
  summer: EDG.gold,
  autumn: EDG.clay,
  winter: EDG.skyBlue,
};

/** Title-case a season name for display (`"spring"` → `"Spring"`). */
function seasonLabel(season: Season): string {
  return season.charAt(0).toUpperCase() + season.slice(1);
}

/** Map a day fraction to a 12-hour wall-clock label (a 20-hour in-game day starting at 6 AM). */
export function fractionToTimeLabel(f: number): string {
  const totalMinutes = Math.floor(f * 20 * 60);
  const hour = (6 + Math.floor(totalMinutes / 60)) % 24;
  const min = totalMinutes % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

/** The retained world-clock: its root node (laid out + rendered by the host) plus refresh(). */
export interface WorldClock {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind all labels from the latest state. Call once per frame.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call (any label text changed), so
   * the host can gate the expensive `computeLayout` + a11y-mirror reconcile behind it. Colour
   * changes don't move anything, so they don't mark it changed. The first call always returns
   * `true` (initial layout). `renderTree`/`surface` must still run every frame regardless.
   */
  refresh(state: WorldClockState): boolean;
}

/**
 * Build the retained world-clock widget tree. The tree is created once; `refresh` mutates it per
 * frame (no re-allocation). Layout: `Season · Day N · Time [Phase]` in a single chrome panel row.
 */
export function createWorldClock(): WorldClock {
  const seasonLbl = label(seasonLabel("spring"), { color: SEASON_COLOR.spring });
  const dayLbl = label("Day 1", { color: EDG.tan });
  const timeLbl = label(fractionToTimeLabel(0), { color: PHASE_COLOR.work });
  const phaseLbl = label(`[${PHASE_LABEL.work}]`, { color: PHASE_COLOR.work });

  // Separators, muted. ASCII "-", not the DOM clock's "·": the in-canvas bitmap font covers
  // printable ASCII (0x20–0x7e) only, so a middot renders as the '?' fallback box.
  const dot1 = label("-", { color: EDG.slate });
  const dot2 = label("-", { color: EDG.slate });

  const row = box({ direction: "row", gap: 8, align: "center" }, [
    seasonLbl,
    dot1,
    dayLbl,
    dot2,
    timeLbl,
    phaseLbl,
  ]);
  const root = panel({ direction: "row", align: "center" }, [row]);

  let changed = false;
  let firstRefresh = true;

  function setText(lbl: LabelNode, text: string): void {
    if (lbl.text !== text) {
      lbl.text = text;
      changed = true;
    }
  }
  function setColor(lbl: LabelNode, color: string): void {
    if (lbl.color !== color) lbl.color = color;
  }

  function refresh(state: WorldClockState): boolean {
    changed = false;

    const season = seasonForDay(state.day);
    const frac = dayFraction(state.tick, state.ticksPerDay);
    const phase = phaseForFraction(frac);

    setText(seasonLbl, seasonLabel(season));
    setColor(seasonLbl, SEASON_COLOR[season]);

    setText(dayLbl, `Day ${state.day}`);

    setText(timeLbl, fractionToTimeLabel(frac));
    setColor(timeLbl, PHASE_COLOR[phase]);

    setText(phaseLbl, `[${PHASE_LABEL[phase]}]`);
    setColor(phaseLbl, PHASE_COLOR[phase]);

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
