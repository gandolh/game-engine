/**
 * Finding a game's recipes: the registered `AtlasConfig` (the cook's list) and the `src/` folder of its recipe
 * package. A recipe lives in `<src>/assets/<frame>.ts` when it is a file; a frame the game generates in code
 * (Farm's farmer poses, from `templates.ts`) has no file.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ATLAS_GAMES, type AtlasConfig, type AtlasRecipe } from "@tool/atlas-builder";

export function gameConfig(id: string): AtlasConfig {
  const config = ATLAS_GAMES.find((g) => g.id === id);
  if (!config) throw new Error(`no game "${id}"; registered: ${ATLAS_GAMES.map((g) => g.id).join(", ")}`);
  return config;
}

export function findRecipe(config: AtlasConfig, frame: string): AtlasRecipe {
  const recipe = config.recipes.find((r) => r.name === frame);
  if (!recipe) throw new Error(`game "${config.id}" has no frame "${frame}"`);
  return recipe;
}

/** The game's recipe `src/` folder, read off the `palette.ts` every game's cook hashes. */
export function recipeSrcDir(config: AtlasConfig): string {
  const inputs = config.hashInputs(config.sheetOrder[0] ?? "", []);
  const palette = inputs.find((f) => f.endsWith("/palette.ts") || f.endsWith("\\palette.ts"));
  if (!palette) throw new Error(`game "${config.id}": cannot find its recipe folder (no palette.ts in hashInputs)`);
  return dirname(palette);
}

/** The recipe's own source file, or null when the frame is generated in code. */
export function recipeFile(config: AtlasConfig, frame: string): string | null {
  const file = resolve(recipeSrcDir(config), "assets", ...frame.split("/")) + ".ts";
  return existsSync(file) ? file : null;
}

/** The PNG file name for a frame: its `/` becomes `__`, so `tile/grass` is `tile__grass.png`. */
export function pngNameOf(frame: string): string {
  return `${frame.replaceAll("/", "__")}.png`;
}

export function frameOfPngName(file: string): string {
  return file
    .replace(/^.*[\\/]/, "")
    .replace(/\.png$/i, "")
    .replaceAll("__", "/");
}
