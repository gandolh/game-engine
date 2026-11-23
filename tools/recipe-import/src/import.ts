/**
 * A PNG back into a recipe file (corpus brief 23). The recipe file is the template: only the characters
 * inside its `pixels: [ ... ]` rows change, so comments, `size`, spacing and the trailing newline stay as they
 * were, and a PNG that was exported and not edited gives back the same bytes. Where a pixel keeps its colour,
 * it keeps its character (two swatches can share a colour); a pixel that changed colour gets the first
 * character with that colour in the swatch table.
 */
import { readFileSync } from "node:fs";
import { findRecipe, recipeFile, recipeHeightOf, recipeWidthOf } from "@tool/recipe-export";
import type { AtlasConfig } from "@tool/atlas-builder";
import { readPngGrid } from "./png";

const ROW = /^(\s*")([^"]*)(",?\s*)$/;

/** The template's rows: the line numbers of the `pixels` rows and their text. */
function pixelRows(lines: readonly string[], frame: string): { at: number; text: string }[] {
  const start = lines.findIndex((l) => /^\s*pixels:\s*\[\s*$/.test(l));
  if (start < 0) throw new Error(`${frame}: the recipe file has no "pixels: [" line to replace`);
  const rows: { at: number; text: string }[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (/^\s*\],?\s*$/.test(line)) return rows;
    const m = ROW.exec(line);
    if (!m) throw new Error(`${frame}: line ${i + 1} is not one quoted row: ${line.trim()}`);
    rows.push({ at: i, text: m[2] as string });
  }
  throw new Error(`${frame}: the "pixels: [" block has no closing "]"`);
}

/** The template text with its pixel rows replaced by the PNG's. Returns the new file text. */
export function importRecipeText(config: AtlasConfig, frame: string, png: Buffer, template: string): string {
  const recipe = findRecipe(config, frame);
  if (!template.includes(`name: "${frame}"`)) throw new Error(`${frame}: the template file is not this frame's`);
  const lines = template.split("\n");
  const rows = pixelRows(lines, frame);
  const grid = readPngGrid(
    config,
    png,
    rows.map((r) => r.text),
  );
  const w = recipeWidthOf(recipe);
  const h = recipeHeightOf(recipe);
  if (grid.width !== w || grid.height !== h) {
    throw new Error(`${frame}: the PNG is ${grid.width}x${grid.height}, the recipe is ${w}x${h}`);
  }
  if (rows.length !== h) throw new Error(`${frame}: the file has ${rows.length} rows, the recipe is ${h} high`);
  rows.forEach((r, i) => {
    const m = ROW.exec(lines[r.at] as string) as RegExpExecArray;
    lines[r.at] = `${m[1]}${grid.rows[i]}${m[3]}`;
  });
  return lines.join("\n");
}

/** The same, reading the game's own recipe file as the template. A generated frame has no file to import to. */
export function importRecipe(config: AtlasConfig, frame: string, png: Buffer): string {
  const file = recipeFile(config, frame);
  if (!file) throw new Error(`${frame}: generated in code (no recipe file), so a PNG cannot be imported back`);
  return importRecipeText(config, frame, png, readFileSync(file, "utf8"));
}
