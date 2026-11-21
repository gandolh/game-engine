/**
 * Farm's atlas config for the cook in `tools/atlas-builder` (corpus brief 09): the values that were written
 * into the cook until 2026-11-21, moved here unchanged. Its shape is the cook's `AtlasConfig`, checked where
 * the cook registers it (`tools/atlas-builder/src/games.ts`); a game never imports the tool.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SWATCH } from "./palette";
import { RECIPES } from "./index";
import { frameToSheetId } from "./sheet-map";
import type { PixelRecipe } from "./types";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(SRC_DIR, "assets");

/** Sheets holding frames generated in `index.ts` from `templates.ts`, which go into their hash too. */
const SHEETS_WITH_GENERATED: ReadonlySet<string> = new Set(["characters", "buildings", "terrain", "items-ui"]);

/** A recipe's own source file, `assets/<name>.ts`, when it has one (generated frames have none). */
function assetFileFor(name: string): string | null {
  const file = resolve(ASSETS_DIR, ...name.split("/")) + ".ts";
  return existsSync(file) ? file : null;
}

/**
 * Farm's six sheets from every recipe (generated frames included), checked against EDG32 and written to the
 * client's `public/atlas/`. Exported as `@farm/atlas-recipes/atlas`, so `index.ts`, which goes into the
 * generated sheets' hash, stays as it was.
 */
export const ATLAS_CONFIG = {
  id: "farm",
  recipes: RECIPES,
  sheetOf: frameToSheetId,
  sheetOrder: ["characters", "buildings", "terrain", "crops", "props", "items-ui"],
  swatches: SWATCH,
  // The engine's palette, named: the cook resolves it, so this package needs no engine import.
  palette: "EDG32" as const,
  hashInputs(sheetId: string, sheetRecipes: readonly PixelRecipe[]): string[] {
    const assets = sheetRecipes.map((r) => assetFileFor(r.name)).filter((f): f is string => f !== null);
    assets.sort();
    const generated = SHEETS_WITH_GENERATED.has(sheetId)
      ? [resolve(SRC_DIR, "index.ts"), resolve(SRC_DIR, "templates.ts")]
      : [];
    return [
      resolve(SRC_DIR, "palette.ts"),
      resolve(SRC_DIR, "sheet-map.ts"),
      resolve(SRC_DIR, "types.ts"),
      ...assets,
      ...generated,
    ];
  },
  outDir: resolve(SRC_DIR, "..", "..", "client", "public", "atlas"),
  urlBase: "/atlas/",
};
