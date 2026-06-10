export { type PixelRecipe } from "./types";
export { PREFIX_TO_SHEET, frameToSheetId, recipeWidth, recipeHeight } from "./sheet-map";
export { colorOf } from "./palette";
export { BASE_RECIPES } from "./assets/index";

import { type PixelRecipe } from "./types";
import { BASE_RECIPES } from "./assets/index";
import {
  ACTION_TEMPLATES,
  PERSONALITY_SUBS,
  applyPersonalitySubs,
  applyFarmerLook,
  applyPersonalityHat,
  FACING_TEMPLATES,
  PIP_DOWN_TEMPLATES,
  NPC_POSES,
} from "./templates";

function farmerPersonality(name: string): string | undefined {
  const m = /^farmer\/([^/]+)/.exec(name);
  return m ? m[1] : undefined;
}

// Stamp per-personality hat onto hand-authored idle/walk frames so they match generated action/facing poses.
const hattedBase: PixelRecipe[] = BASE_RECIPES.map((r) => {
  const personality = farmerPersonality(r.name);
  if (personality === undefined) return r;
  return { ...r, pixels: applyPersonalityHat(r.pixels, personality) };
});

export const RECIPES: PixelRecipe[] = [...hattedBase];

for (const [action, template] of Object.entries(ACTION_TEMPLATES)) {
  for (const [personality, subs] of Object.entries(PERSONALITY_SUBS)) {
    RECIPES.push({
      name: `farmer/${personality}/${action}`,
      size: 16,
      pixels: applyFarmerLook(template, personality, subs),
    });
  }
}

for (const [facing, template] of Object.entries(FACING_TEMPLATES)) {
  for (const [personality, subs] of Object.entries(PERSONALITY_SUBS)) {
    RECIPES.push({
      name: `farmer/${personality}/${facing}`,
      size: 16,
      pixels: applyFarmerLook(template, personality, subs),
    });
  }
}

for (const [suffix, template] of Object.entries(PIP_DOWN_TEMPLATES)) {
  RECIPES.push({
    name: `farmer/pip${suffix}`,
    size: 16,
    pixels: applyFarmerLook(template, "pip", PERSONALITY_SUBS.pip!),
  });
}

RECIPES.push(...NPC_POSES);
