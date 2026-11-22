/**
 * MateQuest's combat creatures as pixel recipes (corpus brief 12): Făt-Frumos and the six enemies, ported from
 * the shape drawings in `games/mathquest/client/src/ui/sprites.ts` at one pixel per unit. The cook turns them
 * into the `combat` sheet; the client draws each frame at a whole-number scale.
 */
import { RECIPES } from "./assets/index";

export { RECIPES } from "./assets/index";
export { MATE_ROLES, CHAR_ROLE, SWATCH, type MateRole } from "./palette";
export type { PixelRecipe } from "./types";

/** The atlas sheet the creatures are cooked onto. */
export const COMBAT_ATLAS_ID = "combat";

/** The column each creature's centre line falls on (where the old drawing's `cx` was). */
const ANCHOR_X: Readonly<Record<string, number>> = {
  hero: 9,
  "enemy/dragon": 15,
  "enemy/balaur": 11,
  "enemy/strigoi": 9,
  "enemy/varcolac": 10,
  "enemy/capcaun": 14,
  "enemy/muma": 11,
};

export interface CombatSprite {
  width: number;
  height: number;
  /** The column of the creature's centre line; its feet are on the bottom row. */
  anchorX: number;
}

/** Each frame's size and anchor, for drawing it centred on its platform. */
export const COMBAT_SPRITES: Readonly<Record<string, CombatSprite>> = Object.fromEntries(
  RECIPES.map((r) => [
    r.name,
    { width: r.width ?? r.size, height: r.height ?? r.size, anchorX: ANCHOR_X[r.name] ?? 0 },
  ]),
);
