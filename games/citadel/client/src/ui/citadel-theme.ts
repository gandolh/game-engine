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
import type { Theme } from "@engine/ui";
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
