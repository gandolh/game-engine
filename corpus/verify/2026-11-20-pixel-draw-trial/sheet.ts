/**
 * Brief 13's blind sheet. Run from the repo root:
 *
 *   node_modules/.bin/tsx corpus/verify/2026-11-20-pixel-draw-trial/sheet.ts
 *
 * Reads the A/B order from `sealed-order.txt` and writes `sheet/strigoi.png` and `sheet/apple-icon.png`: A on the
 * left, B on the right, and from the top each drawing at 1x, at 4x and in place. It prints nothing that names a
 * method.
 *
 * In place is drawn offline, with no game build and no game file changed:
 * - The strigoi: MateQuest's own `drawBattle` paints the combat backdrop at 1280x800 into a software surface. Where
 *   it draws today's strigoi, the trial's drawing goes instead, at the whole-number scale that fits today's strigoi's
 *   height on screen, its lowest opaque row on the ground line and its opaque columns centred on today's centre line.
 * - The apple: Farm's hotbar from a real 1280x800 screenshot (the camera-edge check of 2026-11-24). Slot 6 is
 *   cleared below its number and the apple is drawn where the hotbar draws an icon, 26 px square, nearest
 *   sampling.
 * Both steps are checked against the screenshots they copy: today's strigoi scene and the axe in slot 3 are
 * redrawn and compared pixel by pixel, and the script stops if they differ.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { ATLAS_GAMES, type AtlasConfig, type AtlasRecipe } from "@tool/atlas-builder";
import { COMBAT_SPRITES } from "@mathquest/atlas-recipes";
import { drawBattle } from "../../../games/mathquest/client/src/ui/combat-screen";

const HERE = dirname(fileURLToPath(import.meta.url));
type Rgb = readonly [number, number, number];

function game(id: string): AtlasConfig {
  const config = ATLAS_GAMES.find((g) => g.id === id);
  if (config === undefined) throw new Error(`no game ${id}`);
  return config;
}
const MATHQUEST = game("mathquest");
const FARM = game("farm");

const rgbOf = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;

/** An RGB image with the few operations the sheet needs. */
class Img {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
    fill: Rgb,
  ) {
    this.data = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) this.data.set(fill, i * 3);
  }

  static fromPng(file: string): Img {
    const png = PNG.sync.read(readFileSync(file));
    const img = new Img(png.width, png.height, [0, 0, 0]);
    for (let i = 0; i < png.width * png.height; i++) img.data.set(png.data.subarray(i * 4, i * 4 + 3), i * 3);
    return img;
  }

  get(x: number, y: number): Rgb {
    const o = (y * this.w + x) * 3;
    return [this.data[o] as number, this.data[o + 1] as number, this.data[o + 2] as number];
  }

  set(x: number, y: number, c: Rgb, alpha = 1): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 3;
    for (let i = 0; i < 3; i++) {
      const d = this.data[o + i] as number;
      this.data[o + i] = Math.round((c[i] as number) * alpha + d * (1 - alpha));
    }
  }

  /** A rect covers the pixels whose centres fall inside it, as the GPU rasterises a quad. */
  rect(x: number, y: number, w: number, h: number, c: Rgb, alpha = 1): void {
    const x0 = Math.max(0, Math.ceil(x - 0.5));
    const x1 = Math.min(this.w, Math.ceil(x + w - 0.5));
    const y0 = Math.max(0, Math.ceil(y - 0.5));
    const y1 = Math.min(this.h, Math.ceil(y + h - 0.5));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.set(px, py, c, alpha);
  }

  /** A recipe stretched over a rect, sampled nearest at each pixel centre, as the atlas draws it. */
  recipe(r: AtlasRecipe, config: AtlasConfig, x: number, y: number, w: number, h: number): void {
    const rw = r.width ?? r.size;
    const rh = r.height ?? r.size;
    for (let py = Math.ceil(y - 0.5); py < Math.ceil(y + h - 0.5); py++) {
      for (let px = Math.ceil(x - 0.5); px < Math.ceil(x + w - 0.5); px++) {
        const tx = Math.floor(((px + 0.5 - x) / w) * rw);
        const ty = Math.floor(((py + 0.5 - y) / h) * rh);
        const sw = config.swatches[r.pixels[ty]?.[tx] ?? "."];
        if (sw === undefined || sw[3] === 0) continue;
        this.set(px, py, [sw[0], sw[1], sw[2]]);
      }
    }
  }

  crop(x: number, y: number, w: number, h: number): Img {
    const out = new Img(w, h, [0, 0, 0]);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) out.set(px, py, this.get(x + px, y + py));
    return out;
  }

  blit(src: Img, x: number, y: number): void {
    for (let py = 0; py < src.h; py++) for (let px = 0; px < src.w; px++) this.set(x + px, y + py, src.get(px, py));
  }

  /** Pixels that differ from `other` over a region, skipping the pixels `skip` says. */
  differences(other: Img, x: number, y: number, w: number, h: number, skip: (px: number, py: number) => boolean) {
    let count = 0;
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        if (skip(px, py)) continue;
        const a = this.get(px, py);
        const b = other.get(px, py);
        if (a.some((v, i) => Math.abs(v - (b[i] as number)) > 2)) count++;
      }
    }
    return count;
  }

  png(): Buffer {
    const png = new PNG({ width: this.w, height: this.h });
    for (let i = 0; i < this.w * this.h; i++) {
      png.data.set(this.data.subarray(i * 3, i * 3 + 3), i * 4);
      png.data[i * 4 + 3] = 255;
    }
    return PNG.sync.write(png);
  }
}

async function loadRecipe(file: string): Promise<AtlasRecipe> {
  return ((await import(join(HERE, file))) as { default: AtlasRecipe }).default;
}

/** The opaque columns and the lowest opaque row of a recipe. */
function extent(r: AtlasRecipe): { left: number; right: number; bottom: number } {
  let left = Infinity;
  let right = -1;
  let bottom = -1;
  r.pixels.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ".") continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      bottom = y;
    }
  });
  return { left, right, bottom };
}

// --- the strigoi on MateQuest's combat platform ---------------------------------------------------------------

const VIEW_W = 1280;
const VIEW_H = 800;
// The sky's top and the ground's bottom at 1280x800, read off brief 12's screenshot: the combat layout puts them
// at fractional pixels, and 676.1 is the ground's bottom that redraws its band edges and cloud rows exactly.
const SKY_TOP = 24;
const GROUND_TOP = 676.1;
const STRIGOI_HP = 24;
const STRIGOI_CROP = { x: 640, y: 24, w: 512, h: 376 };

/** The combat scene with `trial` drawn where today's strigoi is, or today's strigoi when `trial` is null. */
function battle(trial: AtlasRecipe | null): { img: Img; todayRect: [number, number, number, number] } {
  const img = new Img(VIEW_W, VIEW_H, [0, 0, 0]);
  let todayRect: [number, number, number, number] = [0, 0, 0, 0];
  const surface = {
    rect: (x: number, y: number, w: number, h: number, color: string, alpha?: number) =>
      img.rect(x, y, w, h, rgbOf(color), alpha ?? 1),
    sprite: (x: number, y: number, w: number, h: number, _atlas: string, frame: string) => {
      const today = MATHQUEST.recipes.find((r) => r.name === frame);
      if (today === undefined) throw new Error(`no frame ${frame}`);
      if (frame !== "enemy/strigoi" || trial === null) {
        if (frame === "enemy/strigoi") todayRect = [x, y, w, h];
        img.recipe(today, MATHQUEST, x, y, w, h);
        return;
      }
      const sprite = COMBAT_SPRITES[frame];
      if (sprite === undefined) throw new Error(`no sprite ${frame}`);
      const k0 = w / sprite.width;
      const cx = x + sprite.anchorX * k0;
      const groundY = y + h;
      const tw = trial.width ?? trial.size;
      const th = trial.height ?? trial.size;
      const k = Math.max(2, Math.floor((sprite.height * k0) / th));
      const { left, right, bottom } = extent(trial);
      const dx = Math.round(cx - ((left + right + 1) / 2) * k);
      const dy = groundY - (bottom + 1) * k;
      img.recipe(trial, MATHQUEST, dx, dy, tw * k, th * k);
    },
  };
  drawBattle(surface as never, VIEW_W, VIEW_H, SKY_TOP, GROUND_TOP, "strigoi", STRIGOI_HP);
  return { img, todayRect };
}

function checkBattle(): void {
  const shot = Img.fromPng(join(HERE, "..", "2026-11-22-mathquest-combat-atlas", "after-strigoi.png"));
  const { img } = battle(null);
  const { x, y, w, h } = STRIGOI_CROP;
  const off = img.differences(shot, x, y, w, h, () => false);
  // A few pixels on the platforms' curved edges round the other way; a misplaced shape would differ in hundreds.
  if (off > (w * h) / 5000) {
    throw new Error(`the redrawn strigoi scene differs from brief 12's screenshot in ${off} pixels`);
  }
  console.log(`strigoi scene: today's scene redrawn matches brief 12's screenshot in all but ${off} of ${w * h} px`);
}

// --- the apple in Farm's hotbar -------------------------------------------------------------------------------

const FARM_SHOT = join(HERE, "..", "2026-11-24-camera-edge", "farm-back.png");
const SLOT_STRIDE = 69; // a 64 px slot and a 5 px gap
const SLOT1 = { x: 366, y: 716 }; // slot 1's top-left, border included
const ICON = { dx: 19.5, dy: 14, size: 26 }; // where the hotbar draws a slot's icon (hotbar.ts, ICON_SIZE), read off the axe
const SLOT_BG: Rgb = [38, 43, 68]; // the slot fill in the screenshot
const APPLE_SLOT = 5; // slot 6, which shows a glyph today and no icon
const HOTBAR_CROP = { x: 636, y: 706, w: 214, h: 90 };

function slotX(i: number): number {
  return SLOT1.x + i * SLOT_STRIDE;
}

function checkHotbar(): void {
  const shot = Img.fromPng(FARM_SHOT);
  const axe = FARM.recipes.find((r) => r.name === "tool/axe");
  if (axe === undefined) throw new Error("no tool/axe");
  const redrawn = Img.fromPng(FARM_SHOT);
  const x = slotX(2) + ICON.dx;
  const y = SLOT1.y + ICON.dy;
  redrawn.rect(x, y, ICON.size, ICON.size, SLOT_BG);
  redrawn.recipe(axe, FARM, x, y, ICON.size, ICON.size);
  const off = redrawn.differences(shot, x, y, ICON.size, ICON.size, () => false);
  if (off > 0) throw new Error(`the redrawn axe in slot 3 differs from the screenshot in ${off} pixels`);
  console.log("hotbar: the axe redrawn in slot 3 matches the screenshot pixel for pixel");
}

function hotbar(apple: AtlasRecipe): Img {
  const img = Img.fromPng(FARM_SHOT);
  const x = slotX(APPLE_SLOT);
  img.rect(x + 1, SLOT1.y + 13, 62, 56, SLOT_BG); // the glyph, caption and count; the slot number stays
  img.recipe(apple, FARM, x + ICON.dx, SLOT1.y + ICON.dy, ICON.size, ICON.size);
  const { x: cx, y: cy, w, h } = HOTBAR_CROP;
  return img.crop(cx, cy, w, h);
}

// --- the sheet ------------------------------------------------------------------------------------------------

const SHEET_BG: Rgb = [32, 32, 32];
const TILE_BG: Rgb = [150, 150, 150];
const INK: Rgb = [240, 240, 240];
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
};

function tile(r: AtlasRecipe, config: AtlasConfig, scale: number): Img {
  const w = (r.width ?? r.size) * scale;
  const h = (r.height ?? r.size) * scale;
  const img = new Img(w + 16, h + 16, TILE_BG);
  img.recipe(r, config, 8, 8, w, h);
  return img;
}

function column(label: string, parts: readonly Img[]): Img {
  const w = Math.max(...parts.map((p) => p.w), 20);
  const h = 28 + parts.reduce((s, p) => s + 12 + p.h, 0);
  const img = new Img(w, h, SHEET_BG);
  (GLYPHS[label] ?? []).forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) if (row[gx] === "#") img.rect(gx * 4, gy * 4, 4, 4, INK);
  });
  let y = 28;
  for (const p of parts) {
    y += 12;
    img.blit(p, 0, y);
    y += p.h;
  }
  return img;
}

function sheet(a: Img, b: Img): Img {
  const img = new Img(16 + a.w + 40 + b.w + 16, 16 + Math.max(a.h, b.h) + 16, SHEET_BG);
  img.blit(a, 16, 16);
  img.blit(b, 16 + a.w + 40, 16);
  return img;
}

type Method = "agent" | "pixel-draw";
interface Order {
  strigoi: { A: Method; B: Method };
  "apple icon": { A: Method; B: Method };
}

const sealed = readFileSync(join(HERE, "sealed-order.txt"), "utf8").trim().split("\n");
const order = JSON.parse(Buffer.from(sealed[sealed.length - 1] ?? "", "base64").toString("utf8")) as Order;

checkBattle();
checkHotbar();

const strigoi: Record<Method, AtlasRecipe> = {
  agent: await loadRecipe("recipes/strigoi-agent.ts"),
  "pixel-draw": await loadRecipe("recipes/strigoi-pixel-draw.ts"),
};
const apple: Record<Method, AtlasRecipe> = {
  agent: await loadRecipe("recipes/apple-agent.ts"),
  "pixel-draw": await loadRecipe("recipes/apple-pixel-draw.ts"),
};

const strigoiColumn = (label: "A" | "B"): Img => {
  const r = strigoi[order.strigoi[label]];
  const { x, y, w, h } = STRIGOI_CROP;
  return column(label, [tile(r, MATHQUEST, 1), tile(r, MATHQUEST, 4), battle(r).img.crop(x, y, w, h)]);
};
const appleColumn = (label: "A" | "B"): Img => {
  const r = apple[order["apple icon"][label]];
  return column(label, [tile(r, FARM, 1), tile(r, FARM, 4), hotbar(r)]);
};

mkdirSync(join(HERE, "sheet"), { recursive: true });
writeFileSync(join(HERE, "sheet", "strigoi.png"), sheet(strigoiColumn("A"), strigoiColumn("B")).png());
writeFileSync(join(HERE, "sheet", "apple-icon.png"), sheet(appleColumn("A"), appleColumn("B")).png());
console.log("wrote sheet/strigoi.png and sheet/apple-icon.png");
