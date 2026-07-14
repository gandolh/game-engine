/**
 * Citadel's Apollo-valued `@engine/ui` chrome theme.
 *
 * `@engine/ui` widgets (panels/buttons/sliders/checkboxes) draw their chrome from a `Theme`
 * (see `engine/ui/src/theme/theme.ts`); `DEFAULT_THEME` there is EDG32-valued. Citadel is
 * migrating to the Apollo palette (`CITADEL_PAL`, `../render/citadel-palette`), so this module
 * mirrors `DEFAULT_THEME`'s exact structure but sources every colour from `CITADEL_PAL` under
 * the SAME role name `DEFAULT_THEME` used for that token (e.g. `panelBg` was `EDG.ink`, so here
 * it's `CITADEL_PAL.ink` — the Apollo value for the same role).
 *
 * Do not edit `engine/ui` — this is a Citadel-local theme value passed as `renderTree`'s 3rd
 * arg (and to any other themed entry point) wherever Citadel lays out/renders its HUD chrome.
 */
import type { IconRamp, Theme } from "@engine/ui";
import type { GoodType } from "@citadel/sim-core";
import { CITADEL_PAL } from "../render/citadel-palette";

export const CITADEL_THEME: Theme = {
  panelBg: CITADEL_PAL.ink,
  panelBorder: CITADEL_PAL.slate,
  borderWidth: 1,

  buttonBg: {
    normal: CITADEL_PAL.blue,
    hover: CITADEL_PAL.skyBlue,
    active: CITADEL_PAL.navy,
    disabled: CITADEL_PAL.slate,
  },
  buttonText: {
    normal: CITADEL_PAL.white,
    hover: CITADEL_PAL.white,
    active: CITADEL_PAL.silver,
    disabled: CITADEL_PAL.steel,
  },

  sliderTrack: CITADEL_PAL.navy,
  sliderFill: CITADEL_PAL.skyBlue,
  sliderThumb: {
    normal: CITADEL_PAL.silver,
    hover: CITADEL_PAL.white,
    active: CITADEL_PAL.cyan,
    disabled: CITADEL_PAL.slate,
  },

  checkboxBox: {
    normal: CITADEL_PAL.ink,
    hover: CITADEL_PAL.navy,
    active: CITADEL_PAL.blue,
    disabled: CITADEL_PAL.slate,
  },
  checkboxBorder: CITADEL_PAL.steel,
  checkboxCheck: CITADEL_PAL.green,

  textColor: CITADEL_PAL.cream,
  textMuted: CITADEL_PAL.steel,

  padding: 6,
  gap: 4,
  textScale: 1,
};

/**
 * Icon ramps for Citadel's `@engine/ui` icons ([engine-ui icon pipeline](../../../../../engine/ui/src/icon/icons.ts)):
 * a 3-colour `[dark, mid, light]` tuple tinting an icon's shade-1/2/3 masks. Icons never bake
 * colour in — every consumer supplies its own ramp from ITS OWN palette (`CITADEL_PAL` here).
 *
 * Two ramps, by role:
 *  - {@link BUILD_ICON_RAMP}: one neutral ramp shared by every build-bar button (buildings +
 *    tools). The button's own fill (blue/skyBlue/navy/slate per `buttonBg`) already carries
 *    interaction state, so the icon itself stays a single warm-neutral read against any of
 *    them — ink outline for silhouette, cream body, white highlight (matches the theme's
 *    `buttonText.normal` white-on-blue look, warmed by `cream` for the cozy-pixel aesthetic).
 *  - {@link GOOD_ICON_RAMPS}: the goods strip's chips were colour-coded per good before icons
 *    existed (see `resource-hud.ts`'s old `GOODS` table) — that identity-by-colour is worth
 *    keeping now that each good also has a real glyph, so each good gets its own tinted ramp
 *    instead of the shared neutral one. Ramps are built from roles in the SAME Apollo hue
 *    family as the good's old single colour (grain/bread/planks from the ochre/gold + timber
 *    families, wood from timber, stone/tools from the neutral stone ramp), dark→light.
 */
export const BUILD_ICON_RAMP: IconRamp = [CITADEL_PAL.ink, CITADEL_PAL.cream, CITADEL_PAL.white];

export const GOOD_ICON_RAMPS: Readonly<Record<GoodType, IconRamp>> = {
  grain: [CITADEL_PAL.clay, CITADEL_PAL.gold, CITADEL_PAL.yellow],
  flour: [CITADEL_PAL.bark, CITADEL_PAL.wood, CITADEL_PAL.cream],
  bread: [CITADEL_PAL.wood, CITADEL_PAL.tan, CITADEL_PAL.cream],
  wood: [CITADEL_PAL.bark, CITADEL_PAL.woodDark, CITADEL_PAL.wood],
  planks: [CITADEL_PAL.woodDark, CITADEL_PAL.clay, CITADEL_PAL.tan],
  stone: [CITADEL_PAL.ink, CITADEL_PAL.slate, CITADEL_PAL.silver],
  tools: [CITADEL_PAL.navy, CITADEL_PAL.steel, CITADEL_PAL.white],
};
