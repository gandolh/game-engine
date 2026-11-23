/**
 * MateQuest's atlas config for the cook in `tools/atlas-builder` (corpus brief 12). Its shape is the cook's
 * `AtlasConfig`, checked where the cook registers it; a game never imports the tool.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPES } from "./index";
import { SWATCH } from "./palette";
import { RECIPE_CHECK_ALLOWLIST } from "./recipe-check-allowlist";
import type { PixelRecipe } from "./types";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** One `combat` sheet, checked against Resurrect-64 (MATE_PAL is a subset), written to the client's atlas. */
export const ATLAS_CONFIG = {
  id: "mathquest",
  recipes: RECIPES,
  sheetOf: (): string => "combat",
  sheetOrder: ["combat"],
  swatches: SWATCH,
  palette: "RESURRECT64" as const,
  hashInputs(_sheetId: string, recipes: readonly PixelRecipe[]): string[] {
    const assets = recipes.map((r) => resolve(SRC_DIR, "assets", ...r.name.split("/")) + ".ts").sort();
    return [
      resolve(SRC_DIR, "palette.ts"),
      resolve(SRC_DIR, "types.ts"),
      resolve(SRC_DIR, "assets", "index.ts"),
      ...assets,
    ];
  },
  outDir: resolve(SRC_DIR, "..", "..", "client", "public", "atlas"),
  urlBase: "/atlas/",
  recipeCheckAllowlist: RECIPE_CHECK_ALLOWLIST,
};
