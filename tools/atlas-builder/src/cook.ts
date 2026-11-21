/**
 * The cook: one game's recipes into atlas sheets (corpus brief 09). Each sheet is shelf-packed with 1 px of
 * padding into a power-of-two PNG with pinned encoder options, beside a JSON manifest that carries the
 * sheet's `inputsHash`. A sheet whose hash is unchanged is not cooked again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { checkSwatches, recipeHeight, recipeWidth, type AtlasConfig, type AtlasRecipe } from "./config";
import { computeSheetHash, PACK_CONSTANTS, PNG_OPTIONS } from "./fingerprint";

interface PackedFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Packed {
  width: number;
  height: number;
  frames: Record<string, PackedFrame>;
}

const PADDING = PACK_CONSTANTS.PADDING;

function nextPow2(n: number): number {
  let v = 1;
  while (v < n) v <<= 1;
  return v;
}

function packShelf(recipes: readonly AtlasRecipe[]): Packed {
  const widest = recipes.reduce((m, r) => Math.max(m, recipeWidth(r)), 0);
  const targetWidth = Math.max(128, nextPow2(widest + PADDING * 2));
  const frames: Record<string, PackedFrame> = {};
  let x = PADDING;
  let y = PADDING;
  let rowHeight = 0;
  for (const r of recipes) {
    const w = recipeWidth(r);
    const h = recipeHeight(r);
    if (x + w + PADDING > targetWidth) {
      x = PADDING;
      y += rowHeight + PADDING;
      rowHeight = 0;
    }
    frames[r.name] = { x, y, w, h };
    x += w + PADDING;
    if (h > rowHeight) rowHeight = h;
  }
  const used = y + rowHeight + PADDING;
  return { width: targetWidth, height: nextPow2(used), frames };
}

function rasterize(packed: Packed, recipes: readonly AtlasRecipe[], config: AtlasConfig): PNG {
  const png = new PNG({ width: packed.width, height: packed.height });
  png.data.fill(0);
  for (const r of recipes) {
    const frame = packed.frames[r.name];
    if (!frame) throw new Error(`Missing frame for ${r.name}`);
    const w = recipeWidth(r);
    const h = recipeHeight(r);
    if (r.pixels.length !== h) {
      throw new Error(`Recipe ${r.name} has ${r.pixels.length} rows != height ${h}`);
    }
    for (let py = 0; py < h; py++) {
      const row = r.pixels[py];
      if (row === undefined) throw new Error(`Recipe ${r.name} missing row ${py}`);
      if (row.length !== w) {
        throw new Error(`Recipe ${r.name} row ${py} length ${row.length} != ${w}`);
      }
      for (let px = 0; px < w; px++) {
        const ch = row.charAt(px);
        const rgba = config.swatches[ch];
        if (rgba === undefined) throw new Error(`Unknown swatch char: ${ch}`);
        const idx = ((frame.y + py) * packed.width + (frame.x + px)) * 4;
        png.data[idx + 0] = rgba[0];
        png.data[idx + 1] = rgba[1];
        png.data[idx + 2] = rgba[2];
        png.data[idx + 3] = rgba[3];
      }
    }
  }
  return png;
}

export interface BuildResult {
  built: string[];
  cached: string[];
}

/** Cooks one game's atlas. `force` cooks every sheet whatever its hash. */
export function buildAtlas(config: AtlasConfig, opts: { force?: boolean } = {}): BuildResult {
  const force = opts.force ?? false;
  const tag = `atlas-builder [${config.id}]`;
  checkSwatches(config);
  mkdirSync(config.outDir, { recursive: true });

  const sheetRecipes = new Map<string, AtlasRecipe[]>();
  for (const recipe of config.recipes) {
    const sheetId = config.sheetOf(recipe.name);
    let group = sheetRecipes.get(sheetId);
    if (group === undefined) {
      group = [];
      sheetRecipes.set(sheetId, group);
    }
    group.push(recipe);
  }
  for (const sheetId of sheetRecipes.keys()) {
    if (!config.sheetOrder.includes(sheetId)) {
      throw new Error(`${tag}: unexpected sheet "${sheetId}": add it to the config's sheetOrder`);
    }
  }

  interface SheetIndexEntry {
    id: string;
    imageUrl: string;
    manifestUrl: string;
  }
  const indexEntries: SheetIndexEntry[] = [];
  const built: string[] = [];
  const cached: string[] = [];
  const entry = (sheetId: string): SheetIndexEntry => ({
    id: sheetId,
    imageUrl: `${config.urlBase}${sheetId}.png`,
    manifestUrl: `${config.urlBase}${sheetId}.json`,
  });

  for (const sheetId of config.sheetOrder) {
    const recipes = sheetRecipes.get(sheetId);
    if (!recipes || recipes.length === 0) {
      console.warn(`${tag}: sheet "${sheetId}" has no recipes, skipping`);
      continue;
    }

    const inputsHash = computeSheetHash(sheetId, config.hashInputs(sheetId, recipes));
    const manifestPath = resolve(config.outDir, `${sheetId}.json`);

    if (!force && existsSync(manifestPath)) {
      try {
        const existing = JSON.parse(readFileSync(manifestPath, "utf8")) as { inputsHash?: string; imageUrl?: string };
        // The URL base is config, not a hashed file, so a manifest that points elsewhere is cooked again.
        if (existing.inputsHash === inputsHash && existing.imageUrl === `${config.urlBase}${sheetId}.png`) {
          console.log(`${tag}: [${sheetId}] cached (${recipes.length} frames)`);
          cached.push(sheetId);
          indexEntries.push(entry(sheetId));
          continue;
        }
      } catch {
        // An unreadable manifest only means the sheet is cooked again.
      }
    }

    const packed = packShelf(recipes);
    const png = rasterize(packed, recipes, config);
    writeFileSync(resolve(config.outDir, `${sheetId}.png`), PNG.sync.write(png, { ...PNG_OPTIONS }));
    const manifest = {
      id: sheetId,
      imageUrl: `${config.urlBase}${sheetId}.png`,
      width: packed.width,
      height: packed.height,
      frames: packed.frames,
      inputsHash,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    indexEntries.push(entry(sheetId));
    built.push(sheetId);
    console.log(`${tag}: [${sheetId}] built: ${recipes.length} frames → ${packed.width}x${packed.height}`);
  }

  const newIndexJson = JSON.stringify({ sheets: indexEntries }, null, 2);
  const indexPath = resolve(config.outDir, "index.json");
  const existingIndexJson = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : null;
  if (existingIndexJson !== newIndexJson) {
    writeFileSync(indexPath, newIndexJson);
    console.log(`${tag}: wrote index.json (${indexEntries.length} sheets)`);
  } else {
    console.log(`${tag}: index.json unchanged`);
  }

  console.log(
    `${tag}: ${config.recipes.length} recipes, ${built.length} sheet(s) built, ${cached.length} sheet(s) cached`,
  );
  return { built, cached };
}
