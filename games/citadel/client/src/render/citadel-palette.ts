// Citadel's Apollo (46) palette, by AdamCYounis.
//
// The ENGINE and Farm Valley stay on the engine's EDG32 palette
// (engine/core/src/render/palette.ts) — this module is Citadel-only.
//
// The crux is CITADEL_PAL: it re-exports the SAME 32 role names as the engine's
// `EDG` (rust, clay, cream, …) but resolved to Apollo values chosen to preserve
// each role's HUE/FUNCTION and — critically — the luminance ordering within every
// shading ramp. Downstream Citadel code migrates by changing only its import:
//
//     import { CITADEL_PAL as EDG } from "<...>/render/citadel-palette";
//
// so call sites keep referring to `EDG.rust`, `EDG.steel`, … unchanged.
//
// Migration decision recorded in the corpus (Apollo palette for Citadel).
//
// sweep-02: the 46-swatch APOLLO list and the nearest-swatch search used to be
// hand-maintained here (identical, character-for-character, to Hollow's copy
// and the engine's own scan-list copy), with nothing asserting the copies
// agreed. A palette is data, not a game, so APOLLO and the generic
// `nearestSwatch` search now live in @engine/core/render (alongside EDG32,
// which was already ordinary exported data) and this module just imports
// them — collapsing what used to be five hand-copied lists into one.
// `nearestApollo` below is kept as a thin alias because call sites read
// better fixed to this palette.

import { APOLLO, APOLLO_SET, nearestSwatch, type ApolloColor } from "@engine/core/render";

export { APOLLO, APOLLO_SET };
export type { ApolloColor };

/**
 * Nearest Apollo colour by squared RGB distance — a thin alias over the
 * engine's generic `nearestSwatch`.
 */
export function nearestApollo(hex: string): ApolloColor {
  return nearestSwatch(hex, APOLLO);
}

/**
 * The 32 EDG role names mapped to Apollo values.
 *
 * Keys are IDENTICAL to the engine's `EDG` — downstream code aliases this as
 * `EDG`, so this object is a drop-in swap. Mapping is by ROLE (roofs stay warm,
 * foliage green, stone/greys neutral, skin fleshy, water blue, alerts vivid),
 * with luminance ordering preserved inside each shading ramp (verified in the
 * guard test). All values are Apollo colours (∈ APOLLO_SET).
 *
 * Apollo has no distinct light orange-tan besides the ones already claimed by
 * skin/skinMid/cream, so `tan` shares `yellow`'s pale warm gold (#e8c170) — the
 * only intentional overlap. `tan` is kept distinct from `skin`/`skinMid` as
 * required, and every warm role keeps its correct hue.
 */
export const CITADEL_PAL = {
  // roofs / rust / brick — warm red-orange
  rust: "#cf573c",
  clay: "#be772b",
  // timber & flesh light warms
  cream: "#e7d5b3",
  tan: "#e8c170", // Apollo lacks a distinct light orange-tan; shares yellow's pale gold
  wood: "#ad7757",
  woodDark: "#7a4841",
  bark: "#4d2b32",
  // reds (dark→bright: crimson < red < rust)
  crimson: "#752438",
  red: "#a53030",
  orange: "#da863e",
  // gold ramp (gold < yellow)
  gold: "#de9e41",
  yellow: "#e8c170",
  // foliage greens (teal/greenDark < greenMid < green)
  green: "#75a743",
  greenMid: "#468232",
  greenDark: "#25562e",
  teal: "#19332d",
  // water blues (blue < skyBlue < cyan)
  blue: "#3c5e8b",
  skyBlue: "#4f8fba",
  cyan: "#73bed3",
  // neutral stone/grey ramp (black < ink < navy < slate < steel < silver < white)
  white: "#ebede9",
  silver: "#c7cfcc",
  steel: "#819796",
  slate: "#577277",
  navy: "#202e37",
  ink: "#151d28",
  black: "#090a14",
  // vivid alerts / accents
  hotPink: "#c65197",
  plum: "#7a367b",
  mauve: "#a23e8c",
  salmon: "#df84a5",
  // skin tones (skinMid < skin)
  skin: "#d7b594",
  skinMid: "#c09473",
} satisfies Record<string, ApolloColor>;
