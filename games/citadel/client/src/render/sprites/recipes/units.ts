/**
 * Unit sprite recipes — villager + raider, authored as 16×16 GREY-RAMP
 * silhouettes (`#` dark outline → `l` mid → `v` body). They are meant to be
 * drawn with a per-instance tint (FSM-state color for villagers, red scaled by
 * strength for raiders): the sprite shader multiplies texture × tint, so a
 * white body becomes the tint color, the silver edge a lighter shade, and the
 * dark outline stays dark — i.e. a shaded colored figure. See quads.ts.
 */
import { Grid } from "./draw";
import type { PixelRecipe } from "../types";

/** A small standing villager. */
function villager(): PixelRecipe {
  const g = new Grid(16, 16);
  // Head.
  g.fillRect(6, 2, 4, 4, "v");
  g.set(6, 2, "l");
  g.set(9, 2, "#");
  g.set(9, 3, "#");
  g.set(7, 4, "#"); // eye hint
  // Torso.
  g.fillRect(5, 6, 6, 5, "v");
  g.vLine(5, 6, 5, "l"); // lit left
  g.vLine(10, 6, 5, "#"); // shaded right
  // Arms.
  g.set(4, 7, "v");
  g.set(4, 8, "v");
  g.set(11, 7, "#");
  g.set(11, 8, "v");
  // Belt.
  g.hLine(5, 10, 6, "#");
  // Legs + feet.
  g.vLine(6, 11, 4, "v");
  g.vLine(9, 11, 4, "v");
  g.set(6, 14, "#");
  g.set(9, 14, "#");
  return g.toRecipe("vil/person");
}

/** A bulkier, horned raider hefting an axe. */
function raider(): PixelRecipe {
  const g = new Grid(16, 16);
  // Horned helmet.
  g.fillRect(6, 3, 5, 4, "v");
  g.set(5, 1, "l");
  g.set(5, 2, "l");
  g.set(11, 1, "l");
  g.set(11, 2, "l");
  g.set(10, 3, "#");
  g.set(10, 4, "#");
  g.set(7, 5, "#"); // visor
  g.set(9, 5, "#");
  // Broad torso.
  g.fillRect(4, 7, 8, 5, "v");
  g.vLine(4, 7, 5, "l");
  g.vLine(11, 7, 5, "#");
  g.hLine(4, 11, 8, "#"); // belt
  // Legs + feet.
  g.vLine(6, 12, 3, "v");
  g.vLine(9, 12, 3, "v");
  g.set(6, 14, "#");
  g.set(9, 14, "#");
  // Axe (haft + blade), right side.
  g.vLine(13, 3, 9, "#");
  g.fillRect(11, 3, 3, 3, "l");
  g.set(11, 3, "v");
  return g.toRecipe("raider");
}

export const UNIT_RECIPES: readonly PixelRecipe[] = [villager(), raider()];

/** Frame names for the unit sprites (referenced from quads.ts). */
export const FRAME_VILLAGER = "vil/person";
export const FRAME_RAIDER = "raider";
