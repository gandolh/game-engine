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

import { rgbOf } from "@engine/core/render";

/**
 * The 46 Apollo colours (lowercase, 6-digit), grouped by hue family.
 * Ordered dark→light within each family so ramps read naturally.
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
 * `nearestEdg32`; reuses `rgbOf` so hex parsing lives in one place).
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
