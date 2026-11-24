/**
 * The `grid.txt` input of `recipe-import` (corpus brief 13): the file sprite-gen's `pixel-draw` writes. A `PALETTE`
 * block of `<key> <colour>` lines (`.` is `transparent`, the rest `#` and six hex digits), then `FRAME <name>`
 * and one row of keys per pixel row, then `END`. One file may hold several frames.
 *
 * The reader turns a frame into a grid of the game's swatch characters: each colour becomes the first character
 * with that colour in the game's swatch table, as `readPngGrid` does without a template. A colour the table lacks
 * is refused. `recipeSource` writes the grid as a new recipe file.
 */
import type { AtlasConfig } from "@tool/atlas-builder";
import type { RecipeGrid } from "./png";

export interface GridFrame {
  name: string;
  /** One string of palette keys per pixel row, top to bottom. */
  rows: string[];
}

export interface GridFile {
  /** Key to colour as lowercase `#rrggbb`, or `null` for transparent. */
  palette: Map<string, string | null>;
  frames: GridFrame[];
}

const COLOUR = /^#[0-9a-fA-F]{6}$/;

/** Parses a `grid.txt`. Throws naming the line of anything it can't read. */
export function parseGridText(text: string): GridFile {
  const palette = new Map<string, string | null>();
  const frames: GridFrame[] = [];
  let section: "start" | "palette" | "frame" | "end" = "start";
  let frame: GridFrame | null = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trimEnd();
    const at = `grid.txt line ${i + 1}`;
    if (section !== "frame" && line.trim() === "") return;
    if (line === "PALETTE") {
      if (section !== "start") throw new Error(`${at}: a second PALETTE block`);
      section = "palette";
      return;
    }
    if (line.startsWith("FRAME ")) {
      if (section === "start") throw new Error(`${at}: FRAME before the PALETTE block`);
      frame = { name: line.slice("FRAME ".length).trim(), rows: [] };
      frames.push(frame);
      section = "frame";
      return;
    }
    if (line === "END") {
      if (section !== "frame") throw new Error(`${at}: END outside a frame`);
      section = "end";
      return;
    }
    if (section === "palette") {
      const m = /^(\S)\s+(\S+)$/.exec(line);
      if (!m) throw new Error(`${at}: not a "<key> <colour>" palette line: ${line}`);
      const [, key, value] = m as unknown as [string, string, string];
      if (palette.has(key)) throw new Error(`${at}: key "${key}" is in the palette twice`);
      if (value === "transparent") palette.set(key, null);
      else if (COLOUR.test(value)) palette.set(key, value.toLowerCase());
      else throw new Error(`${at}: "${value}" is neither "transparent" nor a #rrggbb colour`);
      return;
    }
    if (section === "frame" && frame !== null) {
      if (line === "") return;
      for (const ch of line) {
        if (!palette.has(ch)) throw new Error(`${at}: key "${ch}" is not in the palette`);
      }
      frame.rows.push(line);
      return;
    }
    throw new Error(`${at}: unexpected line: ${line}`);
  });
  if (frames.length === 0) throw new Error("grid.txt: no FRAME");
  for (const f of frames) {
    const width = f.rows[0]?.length ?? 0;
    if (f.rows.length === 0 || width === 0) throw new Error(`grid.txt: frame "${f.name}" has no rows`);
    const bad = f.rows.findIndex((r) => r.length !== width);
    if (bad >= 0)
      throw new Error(`grid.txt: frame "${f.name}" row ${bad} is ${f.rows[bad]?.length} wide, not ${width}`);
  }
  return { palette, frames };
}

const hexOf = (c: readonly number[]): string =>
  "#" +
  c
    .slice(0, 3)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");

export interface GridReadOptions {
  /** The frame to read; may be left out when the file holds one. */
  frame?: string;
  /** Crop to this width and height (see `cropGrid`). Either defaults to the drawing's own. */
  width?: number;
  height?: number;
}

/**
 * One frame of a `grid.txt` as the game's swatch characters. Refuses a colour that has no swatch in the game,
 * naming each key, its colour and how many pixels use it.
 */
export function readGridText(config: AtlasConfig, text: string, options: GridReadOptions = {}): RecipeGrid {
  const file = parseGridText(text);
  const frame =
    options.frame === undefined
      ? file.frames.length === 1
        ? file.frames[0]
        : undefined
      : file.frames.find((f) => f.name === options.frame);
  if (frame === undefined) {
    const names = file.frames.map((f) => f.name).join(", ");
    throw new Error(
      options.frame === undefined
        ? `grid.txt holds ${file.frames.length} frames (${names}); name one`
        : `grid.txt has no frame "${options.frame}" (it has ${names})`,
    );
  }

  const firstChar = new Map<string, string>();
  for (const [ch, c] of Object.entries(config.swatches)) {
    if (c[3] !== 255) continue;
    const hex = hexOf(c);
    if (!firstChar.has(hex)) firstChar.set(hex, ch);
  }
  const charOf = new Map<string, string>();
  const refused = new Map<string, number>(); // key to the pixels that use it
  for (const row of frame.rows) {
    for (const key of row) {
      if (charOf.has(key)) continue;
      const colour = file.palette.get(key) ?? null;
      const ch = colour === null ? "." : firstChar.get(colour);
      if (ch === undefined) refused.set(key, (refused.get(key) ?? 0) + 1);
      else charOf.set(key, ch);
    }
  }
  if (refused.size > 0) {
    const list = [...refused].map(([key, n]) => `key "${key}" is ${file.palette.get(key)} (${n} px)`).join("; ");
    throw new Error(`${refused.size} colour(s) not in the "${config.id}" swatch table: ${list}`);
  }
  const grid: RecipeGrid = {
    width: frame.rows[0]?.length ?? 0,
    height: frame.rows.length,
    rows: frame.rows.map((row) => [...row].map((key) => charOf.get(key) as string).join("")),
  };
  return cropGrid(grid, options.width ?? grid.width, options.height ?? grid.height);
}

/**
 * Crops a drawing to `width` by `height`. The window keeps the drawing's bottom rows, where a sprite stands, and
 * is centred on its opaque columns, inside the drawing. Refuses a size larger than the drawing, and a window that
 * would cut an opaque pixel.
 */
export function cropGrid(grid: RecipeGrid, width: number, height: number): RecipeGrid {
  if (width === grid.width && height === grid.height) return grid;
  if (!(width > 0 && height > 0 && width <= grid.width && height <= grid.height)) {
    throw new Error(`cannot crop a ${grid.width}x${grid.height} drawing to ${width}x${height}`);
  }
  let left = grid.width;
  let right = -1;
  let top = grid.height;
  grid.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ".") continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
    }
  });
  const y0 = grid.height - height;
  const centre = right < 0 ? grid.width / 2 : (left + right + 1) / 2;
  const x0 = Math.min(grid.width - width, Math.max(0, Math.round(centre - width / 2)));
  if (right >= 0 && (left < x0 || right >= x0 + width || top < y0)) {
    throw new Error(
      `cropping to ${width}x${height} would cut the drawing: it spans columns ${left}-${right} and starts on row ` +
        `${top}; the window is columns ${x0}-${x0 + width - 1}, rows ${y0}-${grid.height - 1}`,
    );
  }
  return { width, height, rows: grid.rows.slice(y0).map((row) => row.slice(x0, x0 + width)) };
}

export interface RecipeSourceOptions {
  /** The frame name, such as `enemy/strigoi`. */
  name: string;
  grid: RecipeGrid;
  /** The module specifier of the game's `PixelRecipe` type, relative to the new file. */
  typesImport: string;
  /** A first comment line, without the `//`. */
  comment?: string;
}

/** A new recipe file in the games' shape: `size` is the height, with `width` and `height` when not square. */
export function recipeSource(options: RecipeSourceOptions): string {
  const { name, grid, typesImport, comment } = options;
  const lines = [
    ...(comment === undefined ? [] : [`// ${comment}`]),
    `import type { PixelRecipe } from "${typesImport}";`,
    "",
    "const recipe: PixelRecipe = {",
    `  name: ${JSON.stringify(name)},`,
    `  size: ${grid.height},`,
    ...(grid.width === grid.height ? [] : [`  width: ${grid.width},`, `  height: ${grid.height},`]),
    "  pixels: [",
    ...grid.rows.map((row) => `    ${JSON.stringify(row)},`),
    "  ],",
    "};",
    "",
    "export default recipe;",
    "",
  ];
  return lines.join("\n");
}
