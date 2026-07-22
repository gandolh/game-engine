/**
 * MateQuest's Resurrect-64-valued `@engine/ui` chrome theme.
 *
 * `@engine/ui` widgets (panels/buttons) draw their chrome from a `Theme`
 * (see `engine/ui/src/theme/theme.ts`); `DEFAULT_THEME` there is EDG32-valued. MateQuest owns
 * its own theme instead, mirroring `DEFAULT_THEME`'s exact structure but sourcing every colour
 * from `MATE_PAL` (Resurrect-64) under the SAME role name `DEFAULT_THEME` used for that token
 * (e.g. `panelBg` was `EDG.ink`, so here it's `MATE_PAL.ink`) — the same pattern Citadel's
 * `citadel-theme.ts` and Hollow's `hollow-theme.ts` use for their own palettes.
 *
 * Do not edit `engine/ui` — this is a MateQuest-local theme value passed as `renderTree`'s 3rd
 * arg (and to `computeLayout`) wherever the combat screen lays out/renders its chrome.
 */
import type { Theme } from "@engine/ui";
import { MATE_PAL } from "./mate-palette";

export const MATE_THEME: Theme = {
  panelBg: MATE_PAL.ink,
  panelBorder: MATE_PAL.slate,
  borderWidth: 1,

  buttonBg: {
    normal: MATE_PAL.blue,
    hover: MATE_PAL.skyBlue,
    active: MATE_PAL.navy,
    disabled: MATE_PAL.slate,
  },
  buttonText: {
    normal: MATE_PAL.white,
    hover: MATE_PAL.white,
    active: MATE_PAL.silver,
    disabled: MATE_PAL.steel,
  },

  sliderTrack: MATE_PAL.navy,
  sliderFill: MATE_PAL.skyBlue,
  sliderThumb: {
    normal: MATE_PAL.silver,
    hover: MATE_PAL.white,
    active: MATE_PAL.cyan,
    disabled: MATE_PAL.slate,
  },

  checkboxBox: {
    normal: MATE_PAL.ink,
    hover: MATE_PAL.navy,
    active: MATE_PAL.blue,
    disabled: MATE_PAL.slate,
  },
  checkboxBorder: MATE_PAL.steel,
  checkboxCheck: MATE_PAL.green,

  textColor: MATE_PAL.cream,
  textMuted: MATE_PAL.steel,

  padding: 6,
  gap: 4,
  textScale: 1,
};
