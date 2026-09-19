// Hollow's palette: the SAME Apollo-46 palette (by AdamCYounis) that Citadel
// uses.
//
// sweep-02: the 46-swatch APOLLO list and the nearest-swatch search used to
// be hand-maintained here (identical, character-for-character, to Citadel's
// copy and the engine's own scan-list copy), with nothing asserting the
// copies agreed. A palette is data, not a game, so APOLLO and the generic
// `nearestSwatch` search now live in @engine/core/render (alongside EDG32,
// which was already ordinary exported data) and this module just imports
// them — games still can't import each other, but both Citadel and Hollow
// now import the SAME engine-owned list instead of each hand-copying it.
//
// The ENGINE and Farm Valley stay on the engine's EDG32 palette
// (engine/core/src/render/palette.ts) — this module is Hollow-only.
//
// HOLLOW_PAL re-exports the SAME 32 role names as the engine's `EDG` (rust,
// clay, cream, …) resolved to Apollo values, for the same reason Citadel's
// module does: downstream Hollow code can migrate/import as
//
//     import { HOLLOW_PAL as EDG } from "<...>/render/hollow-palette";
//
// so call sites can refer to `EDG.rust`, `EDG.steel`, … unchanged if Hollow
// code is ever shared/copied across the two Apollo-using games.
//
// On top of the shared 32, HOLLOW_PAL adds Hollow-specific natural skin- and
// hair-tone role constants (chunk hollow-01) for character rendering, each
// resolved to an EXISTING Apollo swatch (no new hex values) — see the roles
// block below for the mapping rationale.

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
 * The 32 EDG role names mapped to Apollo values (identical mapping to
 * Citadel's CITADEL_PAL — kept in lockstep by hollow-palette.test.ts), PLUS
 * Hollow-specific skin/hair tone roles (chunk hollow-01).
 *
 * Skin ramp (light→dark) draws from the browns/timber Apollo family, the same
 * family the shared `skin`/`skinMid` roles already use — `skinLight` and
 * `skinDark` extend that ramp one step lighter/darker; `skinMid` is the SAME
 * swatch as the shared `skinMid` role (no duplicate key — one shared value);
 * `skinDeep` is the family's darkest swatch:
 *   skinLight (#e7d5b3) < skin (#d7b594) < skinMid (#c09473)
 *     < skinDark (#ad7757) < skinDeep (#7a4841)
 *
 * Hair tones are chosen from existing Apollo swatches across families for
 * natural variety (no new hex values — every value below is already a member
 * of `APOLLO`, verified by hollow-palette.test.ts):
 *   hairBlack  — the neutral black (#090a14)
 *   hairBrown  — the browns family's darkest swatch (#4d2b32, "bark")
 *   hairBlonde — the ochre/gold family's pale warm gold (#e8c170, shared with `yellow`/`tan`)
 *   hairRed    — the red/orange family's warm auburn-orange (#da863e, shared with `orange`)
 *   hairGrey   — the neutrals family's mid grey (#577277, shared with `slate`)
 */
export const HOLLOW_PAL = {
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
  // skin tones (skinMid < skin) — shared 32-name contract
  skin: "#d7b594",
  skinMid: "#c09473",

  // --- Hollow-only additions (chunk hollow-01): natural skin/hair tones ---
  // Skin ramp, light→dark (skinLight < skin < skinMid < skinDark < skinDeep):
  skinLight: "#e7d5b3",
  skinDark: "#ad7757",
  skinDeep: "#7a4841",
  // Hair tones:
  hairBlack: "#090a14",
  hairBrown: "#4d2b32",
  hairBlonde: "#e8c170",
  hairRed: "#da863e",
  hairGrey: "#577277",
} satisfies Record<string, ApolloColor>;
