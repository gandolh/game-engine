/**
 * The PNG input of `recipe-import` (corpus brief 23). One input reader per format: each turns a file into a
 * grid of swatch characters, and `import.ts` turns a grid into recipe-file text. Brief 13 adds `grid.txt` as a
 * second reader beside this one.
 */
import { PNG } from "pngjs";
import type { AtlasConfig } from "@tool/atlas-builder";

export interface RecipeGrid {
  width: number;
  height: number;
  /** One string per row, top to bottom. */
  rows: string[];
}

const hex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/**
 * Reads an indexed or RGBA PNG into swatch characters by exact colour. Fully transparent pixels are `.`. A
 * pixel whose colour is not in the game's swatch table (or is partly transparent) is refused, by position
 * and colour. A colour that two swatches share becomes the character the recipe it replaces used there
 * (`previous`), else the first in the table, as the palette guard resolves it.
 */
export function readPngGrid(config: AtlasConfig, png: Buffer, previous?: readonly string[]): RecipeGrid {
  const img = PNG.sync.read(png);
  const byColour = new Map<string, string[]>();
  for (const [ch, c] of Object.entries(config.swatches)) {
    if (c[3] === 0) continue;
    const key = c.join(",");
    byColour.set(key, [...(byColour.get(key) ?? []), ch]);
  }
  const rows: string[] = [];
  const refused: string[] = [];
  for (let y = 0; y < img.height; y++) {
    let row = "";
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      const [r, g, b, a] = [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]] as [
        number,
        number,
        number,
        number,
      ];
      if (a === 0) {
        row += ".";
        continue;
      }
      const chars = byColour.get(`${r},${g},${b},${a}`);
      if (!chars) {
        refused.push(`pixel (${x}, ${y}) is ${hex(r, g, b)}${a === 255 ? "" : ` at alpha ${a}`}`);
        row += "?";
        continue;
      }
      const was = previous?.[y]?.[x];
      row += was !== undefined && chars.includes(was) ? was : (chars[0] as string);
    }
    rows.push(row);
  }
  if (refused.length > 0) {
    const shown = refused.slice(0, 8).join("; ");
    const more = refused.length > 8 ? `; and ${refused.length - 8} more` : "";
    throw new Error(`${refused.length} pixel(s) not in the "${config.id}" palette: ${shown}${more}`);
  }
  return { width: img.width, height: img.height, rows };
}
