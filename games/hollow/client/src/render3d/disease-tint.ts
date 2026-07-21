/**
 * Shared "sickly" tint (chunk hollow-15) — a desaturated, sick-green
 * per-instance RGBA multiplier applied to BOTH a diseased agent's humanoid
 * (`app.ts`'s agent draw loop, right next to `humanoid.ts`'s `humanoidTint`
 * and `selection.ts`'s `selectedTint`) and a rotting corpse's shroud
 * (`corpse-mesh.ts`'s `corpseTint`) — one shared "this reads as unwell /
 * decaying" visual cue reused across both hollow-15 features, rather than
 * inventing two unrelated color schemes for what is, narratively, the same
 * disease. Same MECHANISM `selection.ts`'s `selectedTint` uses (a per-
 * instance RGBA multiplier over whatever tint the instance already carries,
 * alpha passed through unchanged) — just a desaturated `HOLLOW_PAL.greenDark`
 * role instead of selection's bright boosted gold, so a diseased/rotting
 * instance darkens toward sickly green rather than glowing.
 *
 * Pure + deterministic: no RNG, no clock.
 */
import { HOLLOW_PAL } from "../render/hollow-palette";
import { toFloatRgb } from "./materials";

const SICK_RGB = toFloatRgb(HOLLOW_PAL.greenDark);

/**
 * Multiply `baseTint` by the sickly-green role, preserving alpha — pure,
 * mirrors `selectedTint`'s signature/shape exactly so the two compose
 * cleanly (e.g. a selected AND diseased agent: `selectedTint(sicklyTint(base))`).
 */
export function sicklyTint(
  baseTint: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  return [baseTint[0] * SICK_RGB[0], baseTint[1] * SICK_RGB[1], baseTint[2] * SICK_RGB[2], baseTint[3]];
}
