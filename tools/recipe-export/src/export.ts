/**
 * A recipe as an indexed PNG (corpus brief 23). The PNG's palette is the game's swatch table in order, so
 * index 0 (`.`) is transparent and a pixel editor offers only the game's colours. Each pixel's index is its
 * swatch character's position in the table.
 *
 * `pngjs` writes no indexed PNGs, so the chunks are written here: signature, IHDR, PLTE, tRNS, IDAT, IEND.
 */
import { deflateSync, crc32 } from "node:zlib";
import type { AtlasConfig, AtlasRecipe } from "@tool/atlas-builder";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

export function recipeWidthOf(r: AtlasRecipe): number {
  return r.width ?? r.size;
}

export function recipeHeightOf(r: AtlasRecipe): number {
  return r.height ?? r.size;
}

/** The swatch characters in table order: the PNG palette's index order. */
export function swatchOrder(config: AtlasConfig): string[] {
  const chars = Object.keys(config.swatches);
  if (chars.length > 256) throw new Error(`game "${config.id}": ${chars.length} swatches do not fit an 8-bit palette`);
  if (config.swatches["."]?.[3] !== 0 || chars[0] !== ".") {
    throw new Error(`game "${config.id}": the swatch table must start with "." as the transparent colour`);
  }
  return chars;
}

export function recipeToPng(config: AtlasConfig, recipe: AtlasRecipe): Buffer {
  const order = swatchOrder(config);
  const index = new Map(order.map((ch, i) => [ch, i] as const));
  const w = recipeWidthOf(recipe);
  const h = recipeHeightOf(recipe);
  if (recipe.pixels.length !== h) throw new Error(`${recipe.name}: ${recipe.pixels.length} rows, expected ${h}`);

  const raw = Buffer.alloc((w + 1) * h); // each row: filter byte 0, then w indices
  recipe.pixels.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${recipe.name}: row ${y} has ${row.length} columns, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const i = index.get(row[x] as string);
      if (i === undefined) throw new Error(`${recipe.name}: pixel (${x}, ${y}) is "${row[x]}", not a swatch`);
      raw[y * (w + 1) + 1 + x] = i;
    }
  });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // colour type: indexed
  const plte = Buffer.alloc(order.length * 3);
  const alphas = order.map((ch) => (config.swatches[ch] as readonly number[])[3] as number);
  order.forEach((ch, i) => {
    const c = config.swatches[ch] as readonly number[];
    plte[i * 3] = c[0] as number;
    plte[i * 3 + 1] = c[1] as number;
    plte[i * 3 + 2] = c[2] as number;
  });
  let used = alphas.length;
  while (used > 0 && alphas[used - 1] === 255) used--;
  const parts = [SIGNATURE, chunk("IHDR", ihdr), chunk("PLTE", plte)];
  if (used > 0) parts.push(chunk("tRNS", Buffer.from(alphas.slice(0, used))));
  parts.push(chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}
