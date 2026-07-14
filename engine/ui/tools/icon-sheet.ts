/**
 * Icon contact sheet — the RENDER→LOOK→ADJUST loop for `@engine/ui` icon art.
 *
 * Run:  npx tsx engine/ui/tools/icon-sheet.ts [nameFilter]
 *
 * Prints every built-in icon recipe as a legible block-character grid, several across, so
 * the author can SEE the silhouettes instead of reading shade digits and hoping.
 *
 * This tool exists because of a specific, expensive lesson: Citadel's building art was
 * authored blind as ASCII pixel recipes with no visual loop, shipped unreadable, and had to
 * be rebuilt from scratch as 3D meshes. Pixel art authored without looking at it does not
 * work. Do not author or edit an icon in ./src/icon/icons.ts without running this and
 * actually looking at the output.
 *
 * Legend:  ·  transparent    █ 1 dark    ▓ 2 mid    ░ 3 light
 */
import { ICONS, ICON_SIZE } from "../src/icon/icons";
import type { IconRecipe } from "../src/icon/recipe";

const GLYPH: Readonly<Record<string, string>> = { ".": "·", "1": "█", "2": "▓", "3": "░" };

/** One recipe as an array of display rows (block chars), with a name header. */
function block(recipe: IconRecipe): string[] {
  const rows = recipe.pixels.map((r) => [...r].map((c) => GLYPH[c] ?? "?").join(""));
  const head = recipe.name.slice(0, ICON_SIZE).padEnd(ICON_SIZE, " ");
  return [head, ...rows];
}

/** Print `perRow` icons side by side so the whole set can be compared at a glance. */
function sheet(recipes: readonly IconRecipe[], perRow: number): string {
  const out: string[] = [];
  for (let i = 0; i < recipes.length; i += perRow) {
    const group = recipes.slice(i, i + perRow).map(block);
    const height = Math.max(...group.map((g) => g.length));
    for (let r = 0; r < height; r += 1) {
      out.push(group.map((g) => (g[r] ?? "").padEnd(ICON_SIZE + 2, " ")).join(" "));
    }
    out.push("");
  }
  return out.join("\n");
}

const filter = process.argv[2];
const all = Object.values(ICONS).filter((r) => filter === undefined || r.name.includes(filter));
if (all.length === 0) {
  console.error(`no icons match "${filter ?? ""}"`);
  process.exit(1);
}
console.log(sheet(all, 6));
console.log(`${all.length} icon(s) at ${ICON_SIZE}x${ICON_SIZE}`);
