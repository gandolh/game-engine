/**
 * A game's atlas config: everything the cook needs to know about one game's recipes (corpus brief 09).
 * The cook itself knows no game. Each recipe package exports one of these, and `games.ts` lists them.
 */
import type { AnimationDeclaration } from "@engine/core/animation";
import { EDG32, RESURRECT64 } from "@engine/core/render";

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

/** The recipe checks (`recipe-checks.ts`, corpus brief 11). */
export type RecipeRule = "lone-pixel" | "corners" | "floor-row" | "height";

/** A frame (or every frame of a set, written `set/*`) that breaks a recipe check on purpose. */
export interface RecipeAllowance {
  frame: string;
  rule: RecipeRule;
  reason: string;
}

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
  /** Frames that break a recipe check on purpose, each with a reason (`recipe-checks.ts`, corpus brief 11). */
  recipeCheckAllowlist?: readonly RecipeAllowance[];
  /**
   * Animations the set declares: frame names, a duration and loop or once. The cook refuses one that names a
   * frame the set lacks, and writes each into the manifest of the sheet its frames are on.
   */
  animations?: readonly AnimationDeclaration[];
}

/** The palettes the engine exports, which a config can name instead of listing. */
const ENGINE_PALETTES = { EDG32, RESURRECT64 } as const;
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

/**
 * Every declared animation must be named once, list at least one frame, give a positive duration per frame, and
 * name only frames the set has, all on one sheet (its manifest carries it). Throws naming each problem.
 */
export function checkAnimations(config: AtlasConfig): void {
  const frames = new Set(config.recipes.map((r) => r.name));
  const names = new Set<string>();
  const problems: string[] = [];
  for (const a of config.animations ?? []) {
    if (names.has(a.name)) problems.push(`animation "${a.name}": declared twice`);
    names.add(a.name);
    if (a.frames.length === 0) problems.push(`animation "${a.name}": no frames`);
    for (const f of a.frames) {
      if (!frames.has(f)) problems.push(`animation "${a.name}": frame "${f}" is not in the set`);
    }
    const durations = typeof a.frameDurationMs === "number" ? [a.frameDurationMs] : a.frameDurationMs;
    if (typeof a.frameDurationMs !== "number" && durations.length !== a.frames.length) {
      problems.push(`animation "${a.name}": ${durations.length} durations for ${a.frames.length} frames`);
    }
    if (durations.some((d) => !(d > 0) || !Number.isFinite(d))) {
      problems.push(`animation "${a.name}": a duration is not a positive number`);
    }
    if (a.frames.every((f) => frames.has(f)) && new Set(a.frames.map((f) => config.sheetOf(f))).size > 1) {
      problems.push(`animation "${a.name}": frames are on more than one sheet`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`atlas-builder [${config.id}]: bad animations\n  ${problems.join("\n  ")}`);
  }
}
