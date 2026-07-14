import type { UIQuad } from "@engine/core/render";
import type { UISurface } from "../render/ui-surface";
import { frameNameForIcon, ICON_ATLAS_ID } from "./bake";
import { ICON_SIZE } from "./icons";
import { PAINTED_SHADES, type PaintedShade } from "./recipe";

/**
 * Screen-space icon drawing for `@engine/ui`. Mirrors `../text/draw.ts`'s `layoutTextQuads`/
 * `drawText` pair: a pure quad-computation function the widget render walk (and tests) call
 * directly, plus a thin wrapper that pushes those quads through a {@link UISurface}.
 */

/** A 3-colour ramp: `[dark, mid, light]`, one colour per painted shade (1/2/3). Caller-supplied
 * from ITS OWN palette (`EDG.*` in the engine/Farm, `CITADEL_PAL.*` in Citadel) — never baked in. */
export type IconRamp = readonly [string, string, string];

export interface IconDrawOptions {
  /** The 3-colour ramp tinting the icon's dark/mid/light masks, in that order. */
  ramp: IconRamp;
  /** Uniform size multiplier on the icon's native `ICON_SIZE`. Default 1 (12x12 px). */
  scale?: number;
  /** Per-quad opacity in [0,1]. Default 1. Applies to all three stacked quads alike. */
  alpha?: number;
}

/** Ramp colour for one painted shade (1=dark, 2=mid, 3=light). Literal tuple indices (rather
 * than `ramp[shade - 1]`) keep this `string`, not `string | undefined`, under
 * `noUncheckedIndexedAccess` — a computed index can't be proven in-bounds by the compiler. */
function rampColor(ramp: IconRamp, shade: PaintedShade): string {
  switch (shade) {
    case 1:
      return ramp[0];
    case 2:
      return ramp[1];
    case 3:
      return ramp[2];
  }
}

/**
 * Compute the (up to) three textured quads for icon `name` anchored at top-left (`x`,`y`) —
 * one per painted shade, each referencing that shade's mask frame (`frameNameForIcon`) and
 * tinted with the matching `opts.ramp` colour. The three masks are pixel-disjoint (baked from
 * non-overlapping shade regions — see `./bake`), so stacking them in any order reproduces the
 * exact multi-tone icon; drawn dark→mid→light here purely for readability.
 */
export function iconQuads(name: string, x: number, y: number, opts: IconDrawOptions): UIQuad[] {
  const scale = opts.scale ?? 1;
  const alpha = opts.alpha ?? 1;
  const size = ICON_SIZE * scale;
  return PAINTED_SHADES.map((shade) => ({
    x,
    y,
    width: size,
    height: size,
    atlasId: ICON_ATLAS_ID,
    frame: frameNameForIcon(name, shade),
    color: rampColor(opts.ramp, shade),
    alpha,
  }));
}

/** Draw icon `name` at top-left (`x`,`y`), tinted per `opts.ramp`. The surface must already be open. */
export function drawIcon(surface: UISurface, name: string, x: number, y: number, opts: IconDrawOptions): void {
  for (const q of iconQuads(name, x, y, opts)) surface.push(q);
}
