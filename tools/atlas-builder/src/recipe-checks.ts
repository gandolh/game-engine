/**
 * Recipe checks (corpus brief 11): three habits pixel artists rely on, checked over every recipe's character
 * grid. The rules are borrowed from sprite-gen's `pixel-draw` (G5, G6, G8), not its code.
 *
 * - `lone-pixel`: an opaque pixel with no opaque pixel among its eight neighbours. Tiles are exempt: they
 *   repeat and may sparkle.
 * - `corners`: the four corner pixels of a frame are transparent. Tiles are exempt.
 * - `floor-row` and `height`: the frames of one set (the same name up to the last segment, such as one
 *   farmer's poses) stand on one floor row, and their opaque heights stay within a pixel of each other.
 *   Frames are compared with the set's frames of the same size only: a 24 px walk and a 16 px action pose
 *   are drawn at different scales, so their rows don't line up. The most common floor and height are the
 *   reference; a frame off it is reported.
 *
 * A frame that breaks a rule on purpose goes on its recipe package's allowlist, with a reason.
 */
import type { AtlasRecipe, RecipeAllowance, RecipeRule, Rgba } from "./config";

export interface RecipeFinding {
  rule: RecipeRule;
  frame: string;
  /** The pixel the finding is about, from the frame's top-left. */
  x: number;
  y: number;
  detail: string;
}

const isTile = (name: string): boolean => name.startsWith("tile/");

/** The set a frame belongs to: its name up to the last segment. */
function setOf(name: string): string {
  const cut = name.lastIndexOf("/");
  return cut < 0 ? name : name.slice(0, cut);
}

type Opaque = (ch: string) => boolean;

function opaqueAt(r: AtlasRecipe, opaque: Opaque, x: number, y: number): boolean {
  const row = r.pixels[y];
  return row !== undefined && x >= 0 && x < row.length && opaque(row.charAt(x));
}

/** `lone-pixel` and `corners` for one frame. */
export function checkFrame(r: AtlasRecipe, opaque: Opaque): RecipeFinding[] {
  if (isTile(r.name)) return [];
  const findings: RecipeFinding[] = [];
  const h = r.pixels.length;
  const w = r.pixels[0]?.length ?? 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!opaqueAt(r, opaque, x, y)) continue;
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx !== 0 || dy !== 0) && opaqueAt(r, opaque, x + dx, y + dy)) neighbours += 1;
        }
      }
      if (neighbours === 0) findings.push({ rule: "lone-pixel", frame: r.name, x, y, detail: "no opaque neighbour" });
    }
  }
  const corners: [number, number][] = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  for (const [x, y] of corners) {
    if (opaqueAt(r, opaque, x, y)) findings.push({ rule: "corners", frame: r.name, x, y, detail: "opaque corner" });
  }
  return findings;
}

/** The first and last rows holding an opaque pixel, or `null` for an empty frame. */
function opaqueRows(r: AtlasRecipe, opaque: Opaque): { top: number; bottom: number } | null {
  let top = -1;
  let bottom = -1;
  r.pixels.forEach((row, y) => {
    for (const ch of row) {
      if (opaque(ch)) {
        if (top < 0) top = y;
        bottom = y;
        return;
      }
    }
  });
  return top < 0 ? null : { top, bottom };
}

/** The most common value; on a tie, the one seen first. */
function mode(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? 0;
  for (const v of values) if ((counts.get(v) ?? 0) > (counts.get(best) ?? 0)) best = v;
  return best;
}

/** `floor-row` and `height` across the frames of each set of two or more, frame size by frame size. */
export function checkSets(recipes: readonly AtlasRecipe[], opaque: Opaque): RecipeFinding[] {
  const sets = new Map<string, AtlasRecipe[]>();
  for (const r of recipes) {
    if (isTile(r.name)) continue;
    const key = `${setOf(r.name)} ${r.pixels[0]?.length ?? 0}x${r.pixels.length}`;
    const set = sets.get(key);
    if (set === undefined) sets.set(key, [r]);
    else set.push(r);
  }
  const findings: RecipeFinding[] = [];
  for (const frames of sets.values()) {
    const measured = frames.flatMap((r) => {
      const rows = opaqueRows(r, opaque);
      // The floor is counted from the frame's bottom edge, so frames of different sizes compare.
      return rows === null
        ? []
        : [{ r, floor: r.pixels.length - 1 - rows.bottom, bottom: rows.bottom, height: rows.bottom - rows.top + 1 }];
    });
    if (measured.length < 2) continue;
    const floor = mode(measured.map((m) => m.floor));
    const height = mode(measured.map((m) => m.height));
    for (const m of measured) {
      if (m.floor !== floor) {
        findings.push({
          rule: "floor-row",
          frame: m.r.name,
          x: 0,
          y: m.bottom,
          detail: `stands ${m.floor} px above its frame's bottom; its set stands ${floor} px above`,
        });
      }
      if (Math.abs(m.height - height) > 1) {
        findings.push({
          rule: "height",
          frame: m.r.name,
          x: 0,
          y: m.bottom - m.height + 1,
          detail: `is ${m.height} px tall; its set is ${height} px`,
        });
      }
    }
  }
  return findings;
}

/** Every finding over a game's recipes. `swatches` says which characters are opaque (alpha above 0). */
export function checkRecipes(
  recipes: readonly AtlasRecipe[],
  swatches: Readonly<Record<string, Rgba>>,
): RecipeFinding[] {
  const opaque: Opaque = (ch) => (swatches[ch]?.[3] ?? 0) > 0;
  return [...recipes.flatMap((r) => checkFrame(r, opaque)), ...checkSets(recipes, opaque)];
}

/** Whether an allowance covers a finding: the same rule, and the frame itself or `its-set/*`. */
export function isAllowed(finding: RecipeFinding, allow: readonly RecipeAllowance[]): boolean {
  return allow.some(
    (a) => a.rule === finding.rule && (a.frame === finding.frame || a.frame === `${setOf(finding.frame)}/*`),
  );
}

/** One line per finding: the frame, the rule, the pixel and what is wrong. */
export function formatFinding(f: RecipeFinding): string {
  return `${f.frame}: ${f.rule} at (${f.x}, ${f.y}): ${f.detail}`;
}
