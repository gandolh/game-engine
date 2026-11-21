/**
 * A game's atlas config: everything the cook needs to know about one game's recipes (corpus brief 09).
 * The cook itself knows no game. Each recipe package exports one of these, and `games.ts` lists them.
 */
import { EDG32 } from "@engine/core/render";

/** One sprite as a grid of characters, each a key of the config's swatch table. */
export interface AtlasRecipe {
  name: string;
  /** Width and height, unless `width` or `height` says otherwise. */
  size: number;
  width?: number;
  height?: number;
  /** One string per row, top to bottom. */
  pixels: readonly string[];
}

export type Rgba = readonly [number, number, number, number];

export interface AtlasConfig {
  /** The game's id, as `npm run atlas -- <id>` names it. */
  id: string;
  recipes: readonly AtlasRecipe[];
  /** The sheet a frame goes on. */
  sheetOf(frame: string): string;
  /** Every sheet, in the order they are cooked and listed in `index.json`. */
  sheetOrder: readonly string[];
  /** Recipe character to RGBA. An alpha of 0 is transparent and is not palette-checked. */
  swatches: Readonly<Record<string, Rgba>>;
  /**
   * The palette every opaque swatch must come from: an engine palette by name, or a game's own, given as its
   * name and its colours as `#rrggbb`.
   */
  palette: EnginePaletteName | { name: string; colors: readonly string[] };
  /** The files whose bytes go into a sheet's hash, in order: shared ones, then its recipes' own. */
  hashInputs(sheetId: string, recipes: readonly AtlasRecipe[]): readonly string[];
  /** The folder the sheets, their manifests and `index.json` are written to (absolute). */
  outDir: string;
  /** The URL prefix the manifests point at, for example `/atlas/`. */
  urlBase: string;
}

/** The palettes the engine exports, which a config can name instead of listing. */
const ENGINE_PALETTES = { EDG32 } as const;
type EnginePaletteName = keyof typeof ENGINE_PALETTES;

/** The config's palette as a name and a list of colours. */
function paletteOf(config: AtlasConfig): { name: string; colors: readonly string[] } {
  if (typeof config.palette === "string") return { name: config.palette, colors: ENGINE_PALETTES[config.palette] };
  return config.palette;
}

export function recipeWidth(r: AtlasRecipe): number {
  return r.width ?? r.size;
}

export function recipeHeight(r: AtlasRecipe): number {
  return r.height ?? r.size;
}

function hex(rgba: Rgba): string {
  return "#" + [rgba[0], rgba[1], rgba[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/**
 * Every recipe character must have a swatch, and every opaque swatch a recipe uses must be in the config's
 * palette. Throws naming each recipe and character that breaks this.
 */
export function checkSwatches(config: AtlasConfig): void {
  const scope = paletteOf(config);
  const palette = new Set(scope.colors.map((c) => c.toLowerCase()));
  const problems: string[] = [];
  for (const recipe of config.recipes) {
    const seen = new Set<string>();
    for (const row of recipe.pixels) {
      for (const ch of row) {
        if (seen.has(ch)) continue;
        seen.add(ch);
        const rgba = config.swatches[ch];
        if (rgba === undefined) {
          problems.push(`recipe "${recipe.name}": character "${ch}" has no swatch`);
        } else if (rgba[3] !== 0 && !palette.has(hex(rgba))) {
          problems.push(`recipe "${recipe.name}": character "${ch}" is ${hex(rgba)}, not in ${scope.name}`);
        }
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`atlas-builder [${config.id}]: off-palette recipes\n  ${problems.join("\n  ")}`);
  }
}
