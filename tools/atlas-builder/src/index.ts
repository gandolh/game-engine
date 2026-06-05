// Design decisions (brief 47):
//   - Grouping: explicit PREFIX_TO_SHEET map in recipes.ts; unknown prefix → loud error.
//   - One PNG+JSON per sheet, named <sheet>.png / <sheet>.json.
//   - An atlas/index.json lists all sheet ids + their imageUrl/json paths so the
//     runtime loader needs no hardcoded sheet list (adding a sheet = just rebuild).
//   - The old main.png/main.json are superseded and deleted; do NOT commit them.
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { RECIPES, colorOf, recipeWidth, recipeHeight, frameToSheetId, type PixelRecipe } from "./recipes";

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
mkdirSync(outDir, { recursive: true });

// ── Group recipes by sheet ────────────────────────────────────────────────────
// This validates every recipe has a known prefix and assigns it to its sheet.
const sheetRecipes = new Map<string, PixelRecipe[]>();
for (const recipe of RECIPES) {
  const sheetId = frameToSheetId(recipe.name);
  let group = sheetRecipes.get(sheetId);
  if (group === undefined) {
    group = [];
    sheetRecipes.set(sheetId, group);
  }
  group.push(recipe);
}

// ── Pack + rasterize + write one PNG+JSON per sheet ───────────────────────────
const sheetOrder = ["characters", "buildings", "terrain", "crops", "props", "items-ui"] as const;

// Verify all sheets in the map appear in our expected order list (no unexpected sheets).
for (const sheetId of sheetRecipes.keys()) {
  if (!(sheetOrder as readonly string[]).includes(sheetId)) {
    throw new Error(`atlas-builder: unexpected sheet "${sheetId}" — add it to sheetOrder`);
  }
}

interface SheetIndexEntry {
  id: string;
  imageUrl: string;
  manifestUrl: string;
}
const indexEntries: SheetIndexEntry[] = [];

for (const sheetId of sheetOrder) {
  const recipes = sheetRecipes.get(sheetId);
  if (!recipes || recipes.length === 0) {
    console.warn(`atlas-builder: sheet "${sheetId}" has no recipes — skipping`);
    continue;
  }

  const packed = packShelf(recipes);
  const png = rasterize(packed, recipes);
  const pngBuffer = PNG.sync.write(png);
  writeFileSync(resolve(outDir, `${sheetId}.png`), pngBuffer);

  const manifest = {
    id: sheetId,
    imageUrl: `/atlas/${sheetId}.png`,
    width: packed.width,
    height: packed.height,
    frames: packed.frames,
  };
  writeFileSync(resolve(outDir, `${sheetId}.json`), JSON.stringify(manifest, null, 2));

  indexEntries.push({
    id: sheetId,
    imageUrl: `/atlas/${sheetId}.png`,
    manifestUrl: `/atlas/${sheetId}.json`,
  });

  console.log(
    `atlas-builder: [${sheetId}] ${recipes.length} frames → ${packed.width}x${packed.height}`,
  );
}

// ── Emit the index file ───────────────────────────────────────────────────────
// The runtime loads /atlas/index.json to discover sheets without a hardcoded list.
const atlasIndex = { sheets: indexEntries };
writeFileSync(resolve(outDir, "index.json"), JSON.stringify(atlasIndex, null, 2));
console.log(`atlas-builder: wrote index.json (${indexEntries.length} sheets)`);

// ── Remove superseded main.png / main.json ────────────────────────────────────
for (const legacy of ["main.png", "main.json"]) {
  const legacyPath = resolve(outDir, legacy);
  if (existsSync(legacyPath)) {
    rmSync(legacyPath);
    console.log(`atlas-builder: removed superseded ${legacy}`);
  }
}

console.log(
  `atlas-builder: total ${RECIPES.length} recipes across ${indexEntries.length} sheets written to ${outDir}`,
);
