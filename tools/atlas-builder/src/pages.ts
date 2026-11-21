/**
 * Runtime pages (corpus brief 10): a game's sheets packed as whole blocks into as few images as possible, so
 * the renderer binds one texture where it bound one per sheet. Sheets stay the authoring and cache unit.
 *
 * The rule: blocks go tallest first (ties keep the config's sheet order) into columns, top to bottom, a new
 * column when the next block would pass the page's height. A page is the smallest power-of-two rectangle
 * that holds its blocks that way, the squarer one on a tie, at most `MAX_PAGE_SIDE` a side. Blocks that do
 * not all fit one such page open a second, and so on.
 */

/** The largest page side: every WebGL2 device supports 2048 px textures. */
export const MAX_PAGE_SIDE = 2048;

export interface Block {
  id: string;
  w: number;
  h: number;
}

interface PagePlacement {
  id: string;
  x: number;
  y: number;
}

export interface PackedPage {
  width: number;
  height: number;
  placements: PagePlacement[];
}

/** Column packing into a `width`×`height` page, or `null` when the blocks don't all fit. */
function columns(blocks: readonly Block[], width: number, height: number): PagePlacement[] | null {
  const placements: PagePlacement[] = [];
  let x = 0;
  let y = 0;
  let columnWidth = 0;
  for (const b of blocks) {
    if (b.h > height) return null;
    if (y + b.h > height) {
      x += columnWidth;
      y = 0;
      columnWidth = 0;
    }
    if (x + b.w > width) return null;
    placements.push({ id: b.id, x, y });
    y += b.h;
    columnWidth = Math.max(columnWidth, b.w);
  }
  return placements;
}

const POW2_SIDES: number[] = [];
for (let side = 1; side <= MAX_PAGE_SIDE; side *= 2) POW2_SIDES.push(side);

/** The smallest power-of-two page that holds `blocks`, the squarer on a tie, or `null` past the limit. */
function smallestPage(blocks: readonly Block[]): PackedPage | null {
  const area = blocks.reduce((sum, b) => sum + b.w * b.h, 0);
  const sizes: { width: number; height: number }[] = [];
  for (const width of POW2_SIDES)
    for (const height of POW2_SIDES) if (width * height >= area) sizes.push({ width, height });
  sizes.sort(
    (a, b) =>
      a.width * a.height - b.width * b.height ||
      Math.max(a.width, a.height) - Math.max(b.width, b.height) ||
      a.height - b.height,
  );
  for (const { width, height } of sizes) {
    const placements = columns(blocks, width, height);
    if (placements !== null) return { width, height, placements };
  }
  return null;
}

/** Packs `blocks` (in the config's sheet order) into pages, following the rule in this module's header. */
export function packPages(blocks: readonly Block[]): PackedPage[] {
  // Array.prototype.sort is stable, so equal heights keep the sheet order.
  let remaining = [...blocks].sort((a, b) => b.h - a.h || b.w - a.w);
  for (const b of remaining) {
    if (b.w > MAX_PAGE_SIDE || b.h > MAX_PAGE_SIDE) {
      throw new Error(`atlas-builder: sheet "${b.id}" is ${b.w}x${b.h}, past the ${MAX_PAGE_SIDE} px page limit`);
    }
  }
  const pages: PackedPage[] = [];
  while (remaining.length > 0) {
    const taken: Block[] = [];
    for (const b of remaining) {
      if (columns([...taken, b], MAX_PAGE_SIDE, MAX_PAGE_SIDE) !== null) taken.push(b);
    }
    const page = smallestPage(taken);
    if (page === null) throw new Error("atlas-builder: page packing failed"); // `taken` fits 2048² by construction
    pages.push(page);
    remaining = remaining.filter((b) => !taken.includes(b));
  }
  return pages;
}
