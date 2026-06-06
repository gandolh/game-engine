export { type PixelRecipe } from "./types";
export { PREFIX_TO_SHEET, frameToSheetId, recipeWidth, recipeHeight } from "./sheet-map";
export { colorOf } from "./palette";
export { BASE_RECIPES } from "./base-recipes";

import { type PixelRecipe } from "./types";
import { BASE_RECIPES } from "./base-recipes";
import {
  ACTION_TEMPLATES,
  PERSONALITY_SUBS,
  applyPersonalitySubs,
  FACING_TEMPLATES,
  PIP_DOWN_TEMPLATES,
  NPC_POSES,
} from "./templates";

// Build the final RECIPES array in the SAME order as the original file:
//   1. BASE_RECIPES (the big literal)
//   2. Action-pose templates × personalities
//   3. Facing templates × personalities
//   4. Pip down-facing frames
//   5. NPC_POSES
export const RECIPES: PixelRecipe[] = [...BASE_RECIPES];

// ── Farmer action-pose generator ─────────────────────────────────────────────
for (const [action, template] of Object.entries(ACTION_TEMPLATES)) {
  for (const [personality, subs] of Object.entries(PERSONALITY_SUBS)) {
    RECIPES.push({
      name: `farmer/${personality}/${action}`,
      size: 16,
      pixels: applyPersonalitySubs(template, subs),
    });
  }
}

// ── Directional facing frames ─────────────────────────────────────────────────
for (const [facing, template] of Object.entries(FACING_TEMPLATES)) {
  for (const [personality, subs] of Object.entries(PERSONALITY_SUBS)) {
    RECIPES.push({
      name: `farmer/${personality}/${facing}`,
      size: 16,
      pixels: applyPersonalitySubs(template, subs),
    });
  }
}

// ── Pip (player) down-facing base frames ─────────────────────────────────────
for (const [suffix, template] of Object.entries(PIP_DOWN_TEMPLATES)) {
  RECIPES.push({
    name: `farmer/pip${suffix}`,
    size: 16,
    pixels: applyPersonalitySubs(template, PERSONALITY_SUBS.pip!),
  });
}

// ── NPC work poses ────────────────────────────────────────────────────────────
RECIPES.push(...NPC_POSES);
