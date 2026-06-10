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

// Extract the personality from a farmer frame name like `farmer/<p>` or
// `farmer/<p>/walk-a`. Returns undefined for non-farmer frames.
function farmerPersonality(name: string): string | undefined {
  const m = /^farmer\/([^/]+)/.exec(name);
  return m ? m[1] : undefined;
}

// Build the final RECIPES array in the SAME order as the original file:
//   1. BASE_RECIPES (the big literal)
//   2. Action-pose templates × personalities
//   3. Facing templates × personalities
//   4. Pip down-facing frames
//   5. NPC_POSES
// The hand-authored idle + walk farmer frames in BASE_RECIPES are authored
// per-personality (their own pixels with the personality colours baked in), not
// generated. To give EVERY farmer frame the per-personality hat silhouette we
// stamp the hat onto those base frames here too, so idle/walk match the
// generated action/facing poses. Non-farmer base recipes pass through unchanged.
const hattedBase: PixelRecipe[] = BASE_RECIPES.map((r) => {
  const personality = farmerPersonality(r.name);
  if (personality === undefined) return r;
  return { ...r, pixels: applyPersonalityHat(r.pixels, personality) };
});

export const RECIPES: PixelRecipe[] = [...hattedBase];

// ── Farmer action-pose generator ─────────────────────────────────────────────
// Each pose gets the personality colour subs AND the personality hat silhouette,
// so the four farmers are unmistakable in the core farming loop (shape + colour).
for (const [action, template] of Object.entries(ACTION_TEMPLATES)) {
  for (const [personality, subs] of Object.entries(PERSONALITY_SUBS)) {
    RECIPES.push({
      name: `farmer/${personality}/${action}`,
      size: 16,
      pixels: applyFarmerLook(template, personality, subs),
    });
  }
}

// ── Directional facing frames ─────────────────────────────────────────────────
for (const [facing, template] of Object.entries(FACING_TEMPLATES)) {
  for (const [personality, subs] of Object.entries(PERSONALITY_SUBS)) {
    RECIPES.push({
      name: `farmer/${personality}/${facing}`,
      size: 16,
      pixels: applyFarmerLook(template, personality, subs),
    });
  }
}

// ── Pip (player) down-facing base frames ─────────────────────────────────────
for (const [suffix, template] of Object.entries(PIP_DOWN_TEMPLATES)) {
  RECIPES.push({
    name: `farmer/pip${suffix}`,
    size: 16,
    pixels: applyFarmerLook(template, "pip", PERSONALITY_SUBS.pip!),
  });
}

// ── NPC work poses ────────────────────────────────────────────────────────────
RECIPES.push(...NPC_POSES);
