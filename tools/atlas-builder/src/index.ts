import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { RECIPES, colorOf, type PixelRecipe } from "./recipes";

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
  const targetWidth = 128;
  const frames: Record<string, PackedFrame> = {};
  let x = PADDING;
  let y = PADDING;
  let rowHeight = 0;
  for (const r of recipes) {
    if (x + r.size + PADDING > targetWidth) {
      x = PADDING;
      y += rowHeight + PADDING;
      rowHeight = 0;
    }
    frames[r.name] = { x, y, w: r.size, h: r.size };
    x += r.size + PADDING;
    if (r.size > rowHeight) rowHeight = r.size;
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
    for (let py = 0; py < r.size; py++) {
      const row = r.pixels[py];
      if (!row) throw new Error(`Recipe ${r.name} missing row ${py}`);
      if (row.length !== r.size) {
        throw new Error(`Recipe ${r.name} row ${py} length ${row.length} != ${r.size}`);
      }
      for (let px = 0; px < r.size; px++) {
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

const packed = packShelf(RECIPES);
const png = rasterize(packed, RECIPES);
const pngBuffer = PNG.sync.write(png);
writeFileSync(resolve(outDir, "main.png"), pngBuffer);

const manifest = {
  id: "main",
  imageUrl: "/atlas/main.png",
  width: packed.width,
  height: packed.height,
  frames: packed.frames,
};
writeFileSync(resolve(outDir, "main.json"), JSON.stringify(manifest, null, 2));

console.log(
  `atlas-builder: wrote ${RECIPES.length} frames into ${packed.width}x${packed.height} atlas at ${outDir}`,
);
