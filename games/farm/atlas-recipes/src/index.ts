export { type PixelRecipe } from "./types";
export { PREFIX_TO_SHEET, frameToSheetId, recipeWidth, recipeHeight } from "./sheet-map";
export { colorOf } from "./palette";
export { BASE_RECIPES } from "./assets/index";

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to this package's `src/` directory.
 *  Consumed by `@tool/atlas-builder` to locate recipe source files for
 *  fingerprint hashing without a deep cross-package path.
 */
export const RECIPES_SRC_DIR: string = dirname(fileURLToPath(import.meta.url));

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

export const RECIPES: PixelRecipe[] = [...BASE_RECIPES];

function generateFarmer(
  templates: Record<string, readonly string[]>,
  nameFor: (personality: string, key: string) => string,
): void {
  for (const [key, template] of Object.entries(templates)) {
    for (const [personality, subs] of Object.entries(PERSONALITY_SUBS)) {
      RECIPES.push({
        name: nameFor(personality, key),
        size: template.length, 
        pixels: applyFarmerLook(template, personality, subs),
      });
    }
  }
}

generateFarmer(DOWN_TEMPLATES, (p, key) => `farmer/${p}${key}`);

generateFarmer(FACING_TEMPLATES, (p, key) => `farmer/${p}/${key}`);

generateFarmer(ACTION_TEMPLATES, (p, key) => `farmer/${p}/${key}`);
generateFarmer(ACTION_TEMPLATES_B, (p, key) => `farmer/${p}/${key}-b`);

RECIPES.push(...NPC_POSES);
