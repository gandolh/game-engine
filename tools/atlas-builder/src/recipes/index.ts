export { type PixelRecipe } from "./types";
export { PREFIX_TO_SHEET, frameToSheetId, recipeWidth, recipeHeight } from "./sheet-map";
export { colorOf } from "./palette";
export { BASE_RECIPES } from "./assets/index";

import { type PixelRecipe } from "./types";
import { BASE_RECIPES } from "./assets/index";
import {
  ACTION_TEMPLATES,
  ACTION_TEMPLATES_B,
  DOWN_TEMPLATES,
  PERSONALITY_SUBS,
  applyFarmerLook,
  FACING_TEMPLATES,
  NPC_POSES,
} from "./templates";

// All farmer/Pip frames are generated from shared templates × PERSONALITY_SUBS + the hat overlay
// (brief 89: down/Pip unified into the template pipeline; no per-personality down files remain in
// BASE_RECIPES). Frame size follows the template's own grid (24 for locomotion, 16 for actions).
export const RECIPES: PixelRecipe[] = [...BASE_RECIPES];

function generateFarmer(
  templates: Record<string, readonly string[]>,
  nameFor: (personality: string, key: string) => string,
): void {
  for (const [key, template] of Object.entries(templates)) {
    for (const [personality, subs] of Object.entries(PERSONALITY_SUBS)) {
      RECIPES.push({
        name: nameFor(personality, key),
        size: template.length, // square grids → row count == side length (24 locomotion / 16 action)
        pixels: applyFarmerLook(template, personality, subs),
      });
    }
  }
}

// Down (idle + walk) — `farmer/<p>` and `farmer/<p>/walk-a|b`; the "" key yields the bare base.
generateFarmer(DOWN_TEMPLATES, (p, key) => `farmer/${p}${key}`);
// Up / side facings — `farmer/<p>/up`, `/up/walk-a`, `/side`, …
generateFarmer(FACING_TEMPLATES, (p, key) => `farmer/${p}/${key}`);
// Action poses + their `-b` strike frames — `farmer/<p>/till`, `farmer/<p>/till-b`, …
generateFarmer(ACTION_TEMPLATES, (p, key) => `farmer/${p}/${key}`);
generateFarmer(ACTION_TEMPLATES_B, (p, key) => `farmer/${p}/${key}-b`);

RECIPES.push(...NPC_POSES);
