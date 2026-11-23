/**
 * The cook: one game's recipes into atlas sheets (corpus brief 09). Each sheet is shelf-packed with 1 px of
 * padding into a power-of-two PNG with pinned encoder options, beside a JSON manifest that carries the
 * sheet's `inputsHash`. A sheet whose hash is unchanged is not cooked again.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import {
  checkAnimations,
  checkSwatches,
  recipeHeight,
  recipeWidth,
  type AtlasConfig,
  type AtlasRecipe,
} from "./config";
import { BUILDER_VERSION, computeSheetHash, PACK_CONSTANTS, PNG_OPTIONS } from "./fingerprint";
import { MAX_PAGE_SIDE, packPages } from "./pages";

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
  /** Sheets cooked this run, and sheets whose hash was unchanged. */
  built: string[];
  cached: string[];
  /** Whether the runtime pages were composed again (a sheet's hash changed, or `force`). */
  pagesBuilt: boolean;
}

interface PageEntry {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
}

interface IndexJson {
  sheets: { id: string; imageUrl: string; manifestUrl: string }[];
  pages?: PageEntry[];
  placements?: Record<string, { page: string; x: number; y: number }>;
  pagesHash?: string;
}

/** The index already on disk, or `null` when there is none or it can't be read (the pages are then composed). */
function parseIndex(json: string | null): IndexJson | null {
  if (json === null) return null;
  try {
    return JSON.parse(json) as IndexJson;
  } catch {
    return null;
  }
}

/** The pages' hash: the cook's version and options, the URL base, and every sheet's own hash in order. */
function pagesHashOf(config: AtlasConfig, sheetHashes: readonly (readonly [string, string])[]): string {
  const h = createHash("sha256");
  h.update(`BUILDER_VERSION=${BUILDER_VERSION}\nPNG_OPTIONS=${JSON.stringify(PNG_OPTIONS)}\n`);
  h.update(`MAX_PAGE_SIDE=${MAX_PAGE_SIDE}\nURL_BASE=${config.urlBase}\n`);
  for (const [id, hash] of sheetHashes) h.update(`${id}=${hash}\n`);
  return h.digest("hex");
}

/**
 * Composes the runtime pages from the sheet PNGs on disk (corpus brief 10), writes `page-<n>.png`, removes
 * page files a smaller set no longer needs, and returns the index fields that describe them.
 */
function composePages(
  config: AtlasConfig,
  sheetIds: readonly string[],
): Required<Omit<IndexJson, "sheets" | "pagesHash">> {
  const images = new Map(
    sheetIds.map((id) => [id, PNG.sync.read(readFileSync(resolve(config.outDir, `${id}.png`)))] as const),
  );
  const packed = packPages(
    sheetIds.map((id) => ({ id, w: images.get(id)?.width ?? 0, h: images.get(id)?.height ?? 0 })),
  );
  const pages: PageEntry[] = [];
  const placements: Record<string, { page: string; x: number; y: number }> = {};
  packed.forEach((page, n) => {
    const id = `page-${n}`;
    const png = new PNG({ width: page.width, height: page.height });
    png.data.fill(0);
    for (const place of page.placements) {
      const sheet = images.get(place.id);
      if (sheet === undefined) continue;
      for (let row = 0; row < sheet.height; row++) {
        const from = row * sheet.width * 4;
        sheet.data.copy(png.data, ((place.y + row) * page.width + place.x) * 4, from, from + sheet.width * 4);
      }
      placements[place.id] = { page: id, x: place.x, y: place.y };
    }
    writeFileSync(resolve(config.outDir, `${id}.png`), PNG.sync.write(png, { ...PNG_OPTIONS }));
    pages.push({ id, imageUrl: `${config.urlBase}${id}.png`, width: page.width, height: page.height });
  });
  const keep = new Set(pages.map((p) => `${p.id}.png`));
  for (const file of readdirSync(config.outDir)) {
    if (/^page-\d+\.png$/.test(file) && !keep.has(file)) rmSync(resolve(config.outDir, file));
  }
  return { pages, placements };
}

/** Cooks one game's atlas. `force` cooks every sheet whatever its hash. */
export function buildAtlas(config: AtlasConfig, opts: { force?: boolean } = {}): BuildResult {
  const force = opts.force ?? false;
  const tag = `atlas-builder [${config.id}]`;
  checkSwatches(config);
  checkAnimations(config);
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
  const sheetHashes: (readonly [string, string])[] = [];
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
    // The declarations are not a hashed file, so a manifest whose animations differ is written again.
    const animations = (config.animations ?? []).filter(
      (a) => a.frames[0] !== undefined && config.sheetOf(a.frames[0]) === sheetId,
    );
    const animationsJson = JSON.stringify(animations);
    sheetHashes.push([sheetId, inputsHash]);
    const manifestPath = resolve(config.outDir, `${sheetId}.json`);

    if (!force && existsSync(manifestPath)) {
      try {
        const existing = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          inputsHash?: string;
          imageUrl?: string;
          animations?: unknown;
        };
        // The URL base is config, not a hashed file, so a manifest that points elsewhere is cooked again.
        if (
          existing.inputsHash === inputsHash &&
          existing.imageUrl === `${config.urlBase}${sheetId}.png` &&
          JSON.stringify(existing.animations ?? []) === animationsJson
        ) {
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
      // Only a sheet with declared animations carries the field; the others stay as they were.
      ...(animations.length > 0 ? { animations } : {}),
      inputsHash,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    indexEntries.push(entry(sheetId));
    built.push(sheetId);
    console.log(`${tag}: [${sheetId}] built: ${recipes.length} frames → ${packed.width}x${packed.height}`);
  }

  // The runtime pages: composed again only when a sheet's hash (or the cook) changed, so their bytes stay put.
  const indexPath = resolve(config.outDir, "index.json");
  const existingIndexJson = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : null;
  const existing = parseIndex(existingIndexJson);
  const pagesHash = pagesHashOf(config, sheetHashes);
  const reuse =
    !force &&
    existing?.pagesHash === pagesHash &&
    existing.pages !== undefined &&
    existing.placements !== undefined &&
    existing.pages.every((p) => existsSync(resolve(config.outDir, `${p.id}.png`)));
  let pageFields: Required<Omit<IndexJson, "sheets" | "pagesHash">>;
  if (reuse && existing?.pages !== undefined && existing.placements !== undefined) {
    pageFields = { pages: existing.pages, placements: existing.placements };
    console.log(`${tag}: pages cached (${pageFields.pages.length})`);
  } else {
    pageFields = composePages(
      config,
      indexEntries.map((e) => e.id),
    );
    const sizes = pageFields.pages.map((p) => `${p.width}x${p.height}`).join(", ");
    console.log(`${tag}: pages built: ${indexEntries.length} sheets → ${pageFields.pages.length} page(s) (${sizes})`);
  }

  const newIndex: IndexJson = { sheets: indexEntries, ...pageFields, pagesHash };
  const newIndexJson = JSON.stringify(newIndex, null, 2);
  if (existingIndexJson !== newIndexJson) {
    writeFileSync(indexPath, newIndexJson);
    console.log(`${tag}: wrote index.json (${indexEntries.length} sheets)`);
  } else {
    console.log(`${tag}: index.json unchanged`);
  }

  console.log(
    `${tag}: ${config.recipes.length} recipes, ${built.length} sheet(s) built, ${cached.length} sheet(s) cached`,
  );
  return { built, cached, pagesBuilt: !reuse };
}
