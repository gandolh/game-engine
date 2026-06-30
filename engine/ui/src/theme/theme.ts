import { EDG } from "@engine/core/render";

/**
 * Theme tokens for `@engine/ui`.
 *
 * Every colour MUST be an `EDG.*` palette hex (the repo-wide EDG32 guard rejects raw
 * literals). A `Theme` is a flat, plain-data bag of tokens so it can be cloned, partially
 * overridden, and swapped at runtime to re-skin every widget without touching widget code.
 *
 * Widgets read colours/spacing exclusively through the active theme — never hard-coded —
 * so a single `Theme` value is the one place to restyle the whole UI.
 */

/** The visual states a {@link Button} can be in; selects a colour from the theme. */
export type ButtonState = "normal" | "hover" | "active" | "disabled";

/** Per-state colour set for a stateful widget (button fill + its text). */
export interface ButtonColors {
  readonly normal: string;
  readonly hover: string;
  readonly active: string;
  readonly disabled: string;
}

export interface Theme {
  /** Container (Panel/Box) fill colour. `EDG.*`. */
  readonly panelBg: string;
  /** Container border colour. `EDG.*`. Border is omitted when `borderWidth` is 0. */
  readonly panelBorder: string;
  /** Container border thickness in screen px (0 = no border). */
  readonly borderWidth: number;

  /** Button fill colour per visual state. `EDG.*`. */
  readonly buttonBg: ButtonColors;
  /** Button label colour per visual state. `EDG.*`. */
  readonly buttonText: ButtonColors;

  /** Slider track (unfilled groove) colour. `EDG.*`. */
  readonly sliderTrack: string;
  /** Slider fill (the portion left of the thumb, showing the current value). `EDG.*`. */
  readonly sliderFill: string;
  /** Slider thumb fill colour per visual state (normal/hover/active/disabled). `EDG.*`. */
  readonly sliderThumb: ButtonColors;

  /** Checkbox box fill colour per visual state. `EDG.*`. */
  readonly checkboxBox: ButtonColors;
  /** Checkbox box border colour. `EDG.*`. */
  readonly checkboxBorder: string;
  /** Checkbox check-mark colour (drawn when checked). `EDG.*`. */
  readonly checkboxCheck: string;

  /** Default text/label colour. `EDG.*`. */
  readonly textColor: string;
  /** Muted/secondary text colour. `EDG.*`. */
  readonly textMuted: string;

  /** Default inner padding (px) applied to containers when not overridden per node. */
  readonly padding: number;
  /** Default gap (px) between children in a row/column when not overridden per node. */
  readonly gap: number;
  /** Default integer text scale for labels/buttons. */
  readonly textScale: number;
}

/**
 * The default EDG32 theme: a dark slate panel with steel border, blue buttons that lighten
 * on hover / darken on press, and cream text. All tokens are `EDG.*` constants.
 */
export const DEFAULT_THEME: Theme = {
  panelBg: EDG.ink,
  panelBorder: EDG.slate,
  borderWidth: 1,

  buttonBg: {
    normal: EDG.blue,
    hover: EDG.skyBlue,
    active: EDG.navy,
    disabled: EDG.slate,
  },
  buttonText: {
    normal: EDG.white,
    hover: EDG.white,
    active: EDG.silver,
    disabled: EDG.steel,
  },

  sliderTrack: EDG.navy,
  sliderFill: EDG.skyBlue,
  sliderThumb: {
    normal: EDG.silver,
    hover: EDG.white,
    active: EDG.cyan,
    disabled: EDG.slate,
  },

  checkboxBox: {
    normal: EDG.ink,
    hover: EDG.navy,
    active: EDG.blue,
    disabled: EDG.slate,
  },
  checkboxBorder: EDG.steel,
  checkboxCheck: EDG.green,

  textColor: EDG.cream,
  textMuted: EDG.steel,

  padding: 6,
  gap: 4,
  textScale: 1,
};

/**
 * Produce a new theme by shallow-merging `overrides` onto `base` (default
 * {@link DEFAULT_THEME}). Nested colour bags (`buttonBg`/`buttonText`) merge one level deep,
 * so you can override a single state (e.g. just `buttonBg.hover`). Pure — never mutates.
 */
export function makeTheme(
  overrides: DeepPartial<Theme> = {},
  base: Theme = DEFAULT_THEME,
): Theme {
  return {
    ...base,
    ...stripUndefined(overrides),
    buttonBg: { ...base.buttonBg, ...stripUndefined(overrides.buttonBg ?? {}) },
    buttonText: { ...base.buttonText, ...stripUndefined(overrides.buttonText ?? {}) },
    sliderThumb: { ...base.sliderThumb, ...stripUndefined(overrides.sliderThumb ?? {}) },
    checkboxBox: { ...base.checkboxBox, ...stripUndefined(overrides.checkboxBox ?? {}) },
  };
}

/** One-level-deep partial: top-level and the two colour bags may be partially specified. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K];
};

/** Drop keys whose value is `undefined` so they don't clobber `base` under exactOptional. */
function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}
