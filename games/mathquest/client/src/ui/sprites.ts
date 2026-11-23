/**
 * MateQuest's combat sprites: Făt-Frumos and the six Romanian-folklore enemies, drawn from the `combat` atlas
 * (corpus brief 12). The art is pixel recipes in `@mathquest/atlas-recipes`, ported from the shape drawings
 * this module used to compose from rects every frame; each creature is now one textured quad plus its shadow.
 *
 * Convention, unchanged: each `draw*` takes `(surface, cx, baseY, u)` where `cx` is the sprite's horizontal
 * centre, `baseY` its ground line (feet) and `u` the scene's unit. A recipe pixel is one unit, so the sprite
 * is drawn at `u` rounded down to a whole number, at least 2: every art pixel is the same size on screen.
 * Enemies face left (toward the hero); the hero faces right.
 */
import type { UISurface } from "@engine/ui";
import type { EnemySprite } from "@mathquest/sim-core";
import { COMBAT_ATLAS_ID, COMBAT_SPRITES } from "@mathquest/atlas-recipes";
import { MATE_PAL } from "../render/mate-palette";

/** The whole-number scale a scene unit `u` draws at: `u` rounded down, at least 2. */
export function spriteScale(u: number): number {
  return Math.max(2, Math.floor(u));
}

/** Flat SE-offset ground shadow — the fake-height cue the map props use. Drawn here, not in the recipe. */
function shadow(s: UISurface, cx: number, baseY: number, halfW: number): void {
  s.rect(cx - halfW + 3, baseY - 2, halfW * 2, 6, MATE_PAL.ink, 0.28);
  s.rect(cx - halfW * 0.7 + 3, baseY + 1, halfW * 1.4, 3, MATE_PAL.ink, 0.28);
}

/** One creature: its shadow (`shadowUnits` half-wide), then its frame with its feet on `baseY`. */
function drawCreature(s: UISurface, frame: string, cx: number, baseY: number, u: number, shadowUnits: number): void {
  const sprite = COMBAT_SPRITES[frame];
  if (sprite === undefined) return;
  const k = spriteScale(u);
  const x = Math.round(cx) - sprite.anchorX * k;
  const y = Math.round(baseY) - sprite.height * k;
  shadow(s, Math.round(cx), Math.round(baseY), shadowUnits * k);
  s.sprite(x, y, sprite.width * k, sprite.height * k, COMBAT_ATLAS_ID, frame);
}

/** The hero, Făt-Frumos, facing right: sword raised, round shield. */
export function drawHero(s: UISurface, cx: number, baseY: number, u: number): void {
  drawCreature(s, "hero", cx, baseY, u, 8);
}

/** Registry: `EnemyView.sprite` → its draw fn. The shadow widths are the old drawings'. */
export const ENEMY_SPRITE_DRAW: Record<EnemySprite, (s: UISurface, cx: number, baseY: number, u: number) => void> = {
  dragon: (s, cx, baseY, u) => drawCreature(s, "enemy/dragon", cx, baseY, u, 11),
  balaur: (s, cx, baseY, u) => drawCreature(s, "enemy/balaur", cx, baseY, u, 12),
  strigoi: (s, cx, baseY, u) => drawCreature(s, "enemy/strigoi", cx, baseY, u, 6),
  varcolac: (s, cx, baseY, u) => drawCreature(s, "enemy/varcolac", cx, baseY, u, 8),
  capcaun: (s, cx, baseY, u) => drawCreature(s, "enemy/capcaun", cx, baseY, u, 11),
  muma: (s, cx, baseY, u) => drawCreature(s, "enemy/muma", cx, baseY, u, 8),
};
