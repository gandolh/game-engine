// Hollow's palette: the SAME Apollo-46 palette (by AdamCYounis) that Citadel
// uses, copied into a Hollow-owned module — games can't import each other
// (locked convention, CLAUDE.md), so this is a deliberate duplicate of
// games/citadel/client/src/render/citadel-palette.ts's APOLLO table, not a
// shared import.
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

import { rgbOf } from "@engine/core/render";

/**
 * The 46 Apollo colours (lowercase, 6-digit), grouped by hue family.
 * Ordered dark→light within each family so ramps read naturally.
 *
 * IDENTICAL to games/citadel/client/src/render/citadel-palette.ts's APOLLO
 * and to the inline scan list in engine/core/src/render/palette.test.ts —
 * all three must be kept in lockstep (this module's own colocated test,
 * hollow-palette.test.ts, pins this array to the same literal list).
 */
export const APOLLO = [
  // blues
  "#172038", "#253a5e", "#3c5e8b", "#4f8fba", "#73bed3", "#a4dddb",
  // greens
  "#19332d", "#25562e", "#468232", "#75a743", "#a8ca58", "#d0da91",
  // browns / timber
  "#4d2b32", "#7a4841", "#ad7757", "#c09473", "#d7b594", "#e7d5b3",
  // ochre / gold
  "#341c27", "#602c2c", "#884b2b", "#be772b", "#de9e41", "#e8c170",
  // red / orange
  "#241527", "#411d31", "#752438", "#a53030", "#cf573c", "#da863e",
  // purple / pink
  "#1e1d39", "#402751", "#7a367b", "#a23e8c", "#c65197", "#df84a5",
  // neutrals (dark→light)
  "#090a14", "#10141f", "#151d28", "#202e37", "#394a50", "#577277",
  "#819796", "#a8b5b2", "#c7cfcc", "#ebede9",
] as const;

export type ApolloColor = (typeof APOLLO)[number];

export const APOLLO_SET: ReadonlySet<string> = new Set(APOLLO);

/**
 * Nearest Apollo colour by squared RGB distance (same shape as the engine's
 * `nearestEdg32` / Citadel's `nearestApollo`; reuses `rgbOf` so hex parsing
 * lives in one place).
 */
export function nearestApollo(hex: string): ApolloColor {
  const [r, g, b] = rgbOf(hex);
  let best: ApolloColor = APOLLO[0];
  let bestD = Infinity;
  for (const c of APOLLO) {
    const [cr, cg, cb] = rgbOf(c);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
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
