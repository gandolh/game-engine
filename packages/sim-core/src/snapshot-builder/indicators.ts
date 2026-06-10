/**
 * snapshot-builder/indicators.ts — RENDER-ONLY visual state cues.
 *
 * These helpers read POST-TICK sim state and derive a subtle sprite
 * tint+alpha modulation plus a hover-tooltip suffix so spectators can SEE
 * at a glance when a crop is thirsty/dying or a farmer is exhausted / has a
 * broken (empty) tool. They NEVER mutate any component — pure reads.
 *
 * Encoding: each cue returns a `tintRgba` (0xRRGGBBAA — the existing sprite
 * tint format, RGB multiply + alpha in the low byte) and an `alpha` (0..1),
 * plus a short tooltip `suffix`. A healthy/normal entity returns the
 * untinted default (tintRgba 0xffffffff, alpha 1, no suffix) so we only ever
 * deviate the flagged states — no over-tinting.
 *
 * All colors come from the EDG32 palette (`EDG.*` via `rgbOf`) — no raw hex.
 */

import { EDG, rgbOf } from "@engine/core/render";
import type { GameEntity, PlotState } from "../components";
import { DRY_DEATH_GRACE_DAYS } from "../systems/crop-growth";
import { maxApForDay } from "../systems/ap";

/** Default (healthy/normal) tint: full white, no RGB shift. */
export const UNTINTED_RGBA = 0xffffffff;

/**
 * A farmer is "exhausted" when current AP has dropped below this fraction of
 * the day's AP ceiling (or when flagged `unrested`). Chosen low (20%) so the
 * cue means "nearly spent for the day", not "has done a little work".
 */
export const EXHAUSTED_AP_FRACTION = 0.2;

/** One derived visual cue: tint + alpha + a short tooltip suffix. */
export interface StateCue {
  tintRgba: number;
  alpha: number;
  /** Tooltip suffix (e.g. " · thirsty"), or "" when none. */
  suffix: string;
}

const HEALTHY: StateCue = { tintRgba: UNTINTED_RGBA, alpha: 1, suffix: "" };

/**
 * Pack an `EDG.*` swatch + alpha (0..1) into the 0xRRGGBBAA tint word the
 * renderer expects. Built from palette RGB tuples so no off-palette literal
 * is introduced.
 */
function tintFrom(edgHex: string, alpha: number): number {
  const [r, g, b] = rgbOf(edgHex);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

// ── Crop cues ────────────────────────────────────────────────────────────────
// Precedence: DYING (at-risk of withering) > THIRSTY (just unwatered today).
//
// The "dying" threshold mirrors the REAL sim wither rule in crop-growth.ts:
// `daysSinceWater` increments on each dry day and once it EXCEEDS
// DRY_DEATH_GRACE_DAYS (2) the plot reverts to empty (seed lost). So a planted
// crop whose daysSinceWater has already reached the grace days is one more dry
// day away from death — that is the at-risk / "dying" state we flag.

/** Thirsty: faint blue-grey wash, full alpha (subtle, readable). */
const THIRSTY_TINT = tintFrom(EDG.steel, 1);
/** Dying: stronger slate wash + reduced alpha so it reads as fading. */
const DYING_TINT = tintFrom(EDG.slate, 0.6);

/**
 * Derive a crop's visual cue from its planted plot state. Returns the healthy
 * (untinted) cue for a watered, not-at-risk crop.
 */
export function cropCue(state: Extract<PlotState, { kind: "planted" }>): StateCue {
  const drySoFar = state.daysSinceWater ?? 0;
  // At-risk / dying: already at the grace ceiling — the next dry day is fatal.
  if (drySoFar >= DRY_DEATH_GRACE_DAYS) {
    return { tintRgba: DYING_TINT, alpha: 0.6, suffix: " · dying" };
  }
  // Thirsty: unwatered so far today (and not yet at-risk).
  if (state.wateredToday !== true) {
    return { tintRgba: THIRSTY_TINT, alpha: 1, suffix: " · thirsty" };
  }
  return HEALTHY;
}

// ── Farmer cues ──────────────────────────────────────────────────────────────
// Precedence: BROKEN TOOL > EXHAUSTED.
// Rationale: an empty/broken tool is an actionable blocker (the farmer literally
// can't perform the gated action), while exhaustion is the ambient end-of-day
// state most farmers reach — so the rarer, sharper signal wins the single tint.

/** Broken/empty tool: red-ish wash, full alpha (sharp alarm-ish but not flashing). */
const BROKEN_TINT = tintFrom(EDG.red, 1);
/** Exhausted: desaturated + dimmed steel wash. */
const EXHAUSTED_TINT = tintFrom(EDG.steel, 0.8);

/**
 * True when the farmer has a tool that is currently unusable: the watering can
 * is empty (charges === 0) OR a durable tool has run out (durability <= 0).
 * The empty can is the clean, persistent signal (tools may be despawned on
 * break); we also check tool durability defensively for any that linger.
 */
function hasBrokenTool(inv: NonNullable<GameEntity["inventory"]>): boolean {
  if (inv.wateringCan !== undefined && inv.wateringCan.charges === 0) return true;
  if (inv.tools !== undefined) {
    for (const tool of inv.tools) {
      if (tool.durability <= 0) return true;
    }
  }
  return false;
}

/**
 * True when the farmer is exhausted: ap flagged `unrested` (caught away at
 * nightfall) OR current AP is below EXHAUSTED_AP_FRACTION of the day's ceiling.
 */
function isExhausted(entity: GameEntity, day: number): boolean {
  const ap = entity.ap;
  if (ap === undefined) return false;
  if (ap.unrested === true) return true;
  // Prefer the live ap.max; fall back to the day's ceiling if unset.
  const ceiling = ap.max > 0 ? ap.max : maxApForDay(day);
  if (ceiling <= 0) return false;
  return ap.current < ceiling * EXHAUSTED_AP_FRACTION;
}

/**
 * Derive a farmer's visual cue from its inventory + AP state. `day` is the
 * current 0-based sim day (used to size the AP ceiling when ap.max is unset).
 * Returns the healthy (untinted) cue for a rested farmer with usable tools.
 */
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
