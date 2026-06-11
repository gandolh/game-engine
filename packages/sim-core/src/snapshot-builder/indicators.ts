// Render-only visual cues (tint + alpha + tooltip suffix). Never mutates components.
import { EDG, rgbOf } from "@engine/core/render";
import type { GameEntity, PlotState } from "../components";
import { DRY_DEATH_GRACE_DAYS } from "../systems/crop-growth";
import { maxApForDay } from "../systems/ap";

/** Default (healthy/normal) tint: full white, no RGB shift. */
export const UNTINTED_RGBA = 0xffffffff;

/** Farmer is "exhausted" when AP drops below this fraction of the day's ceiling. */
export const EXHAUSTED_AP_FRACTION = 0.2;

/** One derived visual cue: tint + alpha + a short tooltip suffix. */
export interface StateCue {
  tintRgba: number;
  alpha: number;
  /** Tooltip suffix (e.g. " · thirsty"), or "" when none. */
  suffix: string;
}

const HEALTHY: StateCue = { tintRgba: UNTINTED_RGBA, alpha: 1, suffix: "" };

/** Pack an EDG swatch + alpha into the 0xRRGGBBAA tint word the renderer expects. */
function tintFrom(edgHex: string, alpha: number): number {
  const [r, g, b] = rgbOf(edgHex);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

// Crop cue precedence: DYING (daysSinceWater >= DRY_DEATH_GRACE_DAYS) > THIRSTY.
const THIRSTY_TINT = tintFrom(EDG.steel, 1);    // faint blue-grey wash
const DYING_TINT = tintFrom(EDG.slate, 0.6);    // stronger wash + reduced alpha

/** Derive a crop's visual cue from its planted plot state. */
export function cropCue(state: Extract<PlotState, { kind: "planted" }>): StateCue {
  const drySoFar = state.daysSinceWater ?? 0;
  if (drySoFar >= DRY_DEATH_GRACE_DAYS) {
    return { tintRgba: DYING_TINT, alpha: 0.6, suffix: " · dying" };
  }
  if (state.wateredToday !== true) {
    return { tintRgba: THIRSTY_TINT, alpha: 1, suffix: " · thirsty" };
  }
  return HEALTHY;
}

// Farmer cue precedence: BROKEN TOOL > EXHAUSTED.
const BROKEN_TINT = tintFrom(EDG.red, 1);         // red-ish wash
const EXHAUSTED_TINT = tintFrom(EDG.steel, 0.8);  // desaturated + dimmed

function hasBrokenTool(inv: NonNullable<GameEntity["inventory"]>): boolean {
  if (inv.wateringCan !== undefined && inv.wateringCan.charges === 0) return true;
  if (inv.tools !== undefined) {
    for (const tool of inv.tools) {
      if (tool.durability <= 0) return true;
    }
  }
  return false;
}

function isExhausted(entity: GameEntity, day: number): boolean {
  const ap = entity.ap;
  if (ap === undefined) return false;
  if (ap.unrested === true) return true;
  const ceiling = ap.max > 0 ? ap.max : maxApForDay(day);
  if (ceiling <= 0) return false;
  return ap.current < ceiling * EXHAUSTED_AP_FRACTION;
}

/** Derive a farmer's visual cue. `day` sizes the AP ceiling when ap.max is unset. */
export function farmerCue(entity: GameEntity, day: number): StateCue {
  const inv = entity.inventory;
  if (inv !== undefined && hasBrokenTool(inv)) {
    return { tintRgba: BROKEN_TINT, alpha: 1, suffix: " · tool broken" };
  }
  if (isExhausted(entity, day)) {
    return { tintRgba: EXHAUSTED_TINT, alpha: 0.8, suffix: " · exhausted" };
  }
  return HEALTHY;
}
