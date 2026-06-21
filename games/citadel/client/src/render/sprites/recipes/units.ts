/**
 * Unit sprite recipes — villager + raider, authored as 32×32 GREY-RAMP
 * silhouettes (`#` dark outline → `S`/`l` mid → `v` body) at higher detail to
 * match the iso 32-based building art. Drawn with a per-instance tint (FSM-state
 * color for villagers, red×strength for raiders): the shader multiplies
 * texture × tint, so a white body becomes the tint color and the dark outline
 * stays dark. Units stay upright (small figures read fine billboarded on the iso
 * grid). See quads.ts.
 */
import { Grid } from "./draw";
import type { PixelRecipe } from "../types";

const SIZE = 32;

/** A standing villager — tunic, head, arms, legs, feet, with simple shading. */
function villager(): PixelRecipe {
  const g = new Grid(SIZE, SIZE);
  const cx = 16;
  // Head (6 wide), with a lit left and shaded right.
  g.fillRect(cx - 3, 4, 6, 6, "v");
  g.vLine(cx - 3, 4, 6, "l");
  g.vLine(cx + 2, 4, 6, "S");
  g.set(cx - 1, 7, "#"); // eye
  g.set(cx + 1, 7, "#");
  // Torso / tunic (10 tall).
  g.fillRect(cx - 4, 11, 8, 10, "v");
  g.vLine(cx - 4, 11, 10, "l"); // lit left
  g.vLine(cx + 3, 11, 10, "#"); // shaded right
  g.hLine(cx - 4, 16, 8, "S"); // belt
  // Arms.
  g.fillRect(cx - 6, 12, 2, 7, "v"); g.vLine(cx - 6, 12, 7, "l");
  g.fillRect(cx + 4, 12, 2, 7, "v"); g.vLine(cx + 5, 12, 7, "#");
  // Legs + feet.
  g.fillRect(cx - 3, 21, 2, 8, "v");
  g.fillRect(cx + 1, 21, 2, 8, "v");
  g.hLine(cx - 4, 29, 3, "#");
  g.hLine(cx + 1, 29, 3, "#");
  return g.toRecipe("vil/person");
}

/** A bulkier horned raider hefting an axe. */
function raider(): PixelRecipe {
  const g = new Grid(SIZE, SIZE);
  const cx = 16;
  // Horned helmet.
  g.fillRect(cx - 4, 4, 8, 6, "v");
  g.vLine(cx - 4, 4, 6, "l");
  g.vLine(cx + 3, 4, 6, "#");
  g.set(cx - 6, 2, "l"); g.set(cx - 5, 3, "l"); // left horn
  g.set(cx + 5, 2, "l"); g.set(cx + 4, 3, "l"); // right horn
  g.hLine(cx - 3, 8, 6, "#"); // visor
  // Broad torso.
  g.fillRect(cx - 6, 11, 12, 10, "v");
  g.vLine(cx - 6, 11, 10, "l");
  g.vLine(cx + 5, 11, 10, "#");
  g.hLine(cx - 6, 17, 12, "#"); // belt
  // Legs + feet.
  g.fillRect(cx - 4, 21, 3, 8, "v");
  g.fillRect(cx + 1, 21, 3, 8, "v");
  g.hLine(cx - 5, 29, 4, "#");
  g.hLine(cx + 1, 29, 4, "#");
  // Axe: haft down the right, blade up top.
  g.vLine(cx + 8, 6, 16, "#");
  g.fillRect(cx + 6, 6, 4, 5, "l");
  g.set(cx + 6, 6, "v");
  return g.toRecipe("raider");
}

export const UNIT_RECIPES: readonly PixelRecipe[] = [villager(), raider()];

/** Frame names for the unit sprites (referenced from quads.ts). */
export const FRAME_VILLAGER = "vil/person";
export const FRAME_RAIDER = "raider";
