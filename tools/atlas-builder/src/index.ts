// Per-sheet incremental build: SHA-256 fingerprint per sheet; skip when manifest hash matches.
// Pinned PNG encoder (filterType:0, deflateLevel:9, deflateStrategy:3) → deterministic bytes across machines.
// --force / FORCE=1 bypasses all skips. index.json rewritten only on content change.
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import {
  RECIPES,
  colorOf,
  recipeWidth,
  recipeHeight,
  frameToSheetId,
  type PixelRecipe,
} from "./recipes";
import { computeSheetHash, PNG_OPTIONS } from "./fingerprint";

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

const PADDING = 1;

function nextPow2(n: number): number {
  let v = 1;
  while (v < n) v <<= 1;
  return v;
}

function packShelf(recipes: readonly PixelRecipe[]): Packed {
  // Widen the atlas enough that the widest frame fits on a shelf (big multi-tile
  // structures are 32px wide; 16px frames still pack the same as before).
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

function rasterize(packed: Packed, recipes: readonly PixelRecipe[]): PNG {
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
      if (!row) throw new Error(`Recipe ${r.name} missing row ${py}`);
      if (row.length !== w) {
        throw new Error(`Recipe ${r.name} row ${py} length ${row.length} != ${w}`);
      }
      for (let px = 0; px < w; px++) {
        const ch = row.charAt(px);
        const [cr, cg, cb, ca] = colorOf(ch);
        const idx = ((frame.y + py) * packed.width + (frame.x + px)) * 4;
        png.data[idx + 0] = cr;
        png.data[idx + 1] = cg;
        png.data[idx + 2] = cb;
        png.data[idx + 3] = ca;
      }
    }
  }
  return png;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../../../packages/farm-valley/public/atlas");
const recipesDir = resolve(__dirname, "recipes");
const assetsDir = resolve(__dirname, "recipes/assets");
mkdirSync(outDir, { recursive: true });

const force = process.argv.includes("--force") || process.env["FORCE"] === "1";

const sheetRecipes = new Map<string, PixelRecipe[]>();
const recipeAssetPaths = new Map<string, string>();

function assetFileForRecipe(name: string): string {
  return resolve(assetsDir, ...name.split("/")) + ".ts";
}

for (const recipe of RECIPES) {
  const sheetId = frameToSheetId(recipe.name);
  let group = sheetRecipes.get(sheetId);
  if (group === undefined) {
    group = [];
    sheetRecipes.set(sheetId, group);
  }
  group.push(recipe);
  const assetPath = assetFileForRecipe(recipe.name); // only BASE_RECIPES have a file; generated frames come from templates.ts
  if (existsSync(assetPath)) {
    recipeAssetPaths.set(recipe.name, assetPath);
  }
}

const sheetOrder = ["characters", "buildings", "terrain", "crops", "props", "items-ui"] as const;

for (const sheetId of sheetRecipes.keys()) {
  if (!(sheetOrder as readonly string[]).includes(sheetId)) {
    throw new Error(`atlas-builder: unexpected sheet "${sheetId}" — add it to sheetOrder`);
  }
}

// Characters: farmer action/facing poses. Buildings/terrain/items-ui: NPC_POSES from templates.ts.
const SHEETS_WITH_GENERATED = new Set(["characters", "buildings", "terrain", "items-ui"]);

const recipesIndexPath = resolve(recipesDir, "index.ts");
const templatesPath = resolve(recipesDir, "templates.ts");

interface SheetIndexEntry {
  id: string;
  imageUrl: string;
  manifestUrl: string;
}
const indexEntries: SheetIndexEntry[] = [];
let builtCount = 0;
let cachedCount = 0;

for (const sheetId of sheetOrder) {
  const recipes = sheetRecipes.get(sheetId);
  if (!recipes || recipes.length === 0) {
    console.warn(`atlas-builder: sheet "${sheetId}" has no recipes — skipping`);
    continue;
  }

  const sheetAssetFiles: string[] = [];
  for (const recipe of recipes) {
    const p = recipeAssetPaths.get(recipe.name);
    if (p !== undefined) sheetAssetFiles.push(p);
  }
  sheetAssetFiles.sort(); // deterministic hash order

  const hasGenerated = SHEETS_WITH_GENERATED.has(sheetId);
  const inputsHash = computeSheetHash(
    sheetId,
    sheetAssetFiles,
    recipesDir,
    hasGenerated,
    recipesIndexPath,
    templatesPath,
  );

  const manifestPath = resolve(outDir, `${sheetId}.json`);

  if (!force && existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(readFileSync(manifestPath, "utf8")) as { inputsHash?: string };
      if (existing.inputsHash === inputsHash) {
        console.log(`atlas-builder: [${sheetId}] cached (${recipes.length} frames)`);
        cachedCount++;
        indexEntries.push({
          id: sheetId,
          imageUrl: `/atlas/${sheetId}.png`,
          manifestUrl: `/atlas/${sheetId}.json`,
        });
        continue;
      }
    } catch {
      // If we can't read/parse the existing manifest, rebuild
    }
  }

  const packed = packShelf(recipes);
  const png = rasterize(packed, recipes);
  const pngBuffer = PNG.sync.write(png, { ...PNG_OPTIONS }); // spread: pngjs mutates options in-place
  writeFileSync(resolve(outDir, `${sheetId}.png`), pngBuffer);

  const manifest = {
    id: sheetId,
    imageUrl: `/atlas/${sheetId}.png`,
    width: packed.width,
    height: packed.height,
    frames: packed.frames,
    inputsHash,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  indexEntries.push({
    id: sheetId,
    imageUrl: `/atlas/${sheetId}.png`,
    manifestUrl: `/atlas/${sheetId}.json`,
  });

  builtCount++;
  console.log(
    `atlas-builder: [${sheetId}] built — ${recipes.length} frames → ${packed.width}x${packed.height}`,
  );
}

// runtime discovers sheets via /atlas/index.json — no hardcoded sheet list needed.
const atlasIndex = { sheets: indexEntries };
const newIndexJson = JSON.stringify(atlasIndex, null, 2);
const indexPath = resolve(outDir, "index.json");
const existingIndexJson = existsSync(indexPath)
  ? readFileSync(indexPath, "utf8")
  : null;

if (existingIndexJson !== newIndexJson) {
  writeFileSync(indexPath, newIndexJson);
  console.log(`atlas-builder: wrote index.json (${indexEntries.length} sheets)`);
} else {
  console.log(`atlas-builder: index.json unchanged`);
}

for (const legacy of ["main.png", "main.json"]) {
  const legacyPath = resolve(outDir, legacy);
  if (existsSync(legacyPath)) {
    rmSync(legacyPath);
    console.log(`atlas-builder: removed superseded ${legacy}`);
  }
}

const totalRecipes = [...sheetRecipes.values()].reduce((s, rs) => s + rs.length, 0);
console.log(
  `atlas-builder: ${totalRecipes} recipes — ${builtCount} sheet(s) built, ${cachedCount} sheet(s) cached`,
);
