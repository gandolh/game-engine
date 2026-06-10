/**
 * render-systems/geometry.ts — world geometry: island walls, shores, bridges,
 * fences, coral, ocean tiles, and big structure definitions.
 *
 * All compute* functions run at MODULE LOAD to build their resulting consts.
 * They are deterministic pure geometry (no RNG) so load order is preserved and
 * the consts compute identically across every import.
 */

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  REGIONS,
  regionAt,
  isWalkable,
  type RegionId,
} from "../world/regions";
import { CORAL_REEFS } from "../world/coral";

// ── Cliff-face tiles (brief 65) ───────────────────────────────────────────────

/** Islands that get a cliff skirt (rows = number of ocean tile rows south of the
 *  island's south coast that get cliff-face tiles). Render-only; pathfinding,
 *  collision, and determinism are untouched (cliffs sit on non-walkable ocean). */
export const TALL_ISLANDS: ReadonlyArray<{ region: RegionId; rows: 1 | 2 }> = [
  { region: "heritage-ruin",  rows: 1 }, // ruined watchtower — strong vertical read
  { region: "waterfall",      rows: 2 }, // height explains the cascade best with 2 rows
  { region: "shrine",         rows: 1 }, // sacred elevated promontory
  { region: "quarry-north",   rows: 1 }, // quarry carved from a rocky cliff
];

export interface CliffTile {
  tx: number;
  ty: number;
  frame: string;
  row: number; // 0 = first ocean row south, 1 = second (only for rows:2 islands)
}

/** A/B variant from tile coordinates — derived deterministically, no RNG. */
function cliffVariant(tx: number, ty: number): "a" | "b" {
  return (tx * 3 + ty * 5) % 2 === 0 ? "a" : "b";
}

const TILE = 16;

// ── Tile geometry types ───────────────────────────────────────────────────────

export interface FenceTile {
  tx: number;
  ty: number;
  rotation: number;
}

export interface WallTile {
  tx: number;
  ty: number;
  rotation: number;
  frame: string;
}

export interface ShoreTile {
  tx: number;
  ty: number;
  rotation: number;
}

export interface BridgeTile {
  tx: number;
  ty: number;
  rotation: number;
}

export interface CoralTile {
  tx: number;
  ty: number;
  frame: string;
  rotation: number;
}

// ── edgeFrame ────────────────────────────────────────────────────────────────

/**
 * The edge material for a region's island margin. Each island reads as its own
 * place, so its shoreline is themed:
 *   farm fields   → soft sandy beach (`tile/shore-sand`)
 *   carpentry     → built wooden bulwark (`tile/wall-wood`)
 *   blacksmith / quarries → hard stone wall (`tile/wall`)
 *   fishing isles → sandy beach (they're sand islands)
 *   everything else → stone wall (a neutral retaining edge)
 */
export function edgeFrame(region: RegionId): string {
  if (region.startsWith("farm-")) return "tile/shore-sand";
  if (region === "fishing-isle" || region === "fishing-isle-2") return "tile/shore-sand";
  if (region === "carpentry") return "tile/wall-wood";
  // blacksmith, quarry-*, village, forests, mill, wells, grove, ice-pond, …
  return "tile/wall";
}

// ── Fences ───────────────────────────────────────────────────────────────────

/**
 * Compute fence perimeter tiles for every farm region. Skips any tile whose
 * neighbor (one step outside the farm) is walkable — that's the road-facing
 * gap where the farm meets a road, so we don't visually block the entry — AND
 * any tile whose neighbor is OCEAN: in the archipelago a farm edge facing water
 * is an island margin, which gets a stone WALL (see `computeWalls`) instead of
 * a wooden fence. Fences therefore only ever enclose a farm boundary that abuts
 * another LAND region (none in the current layout, but the logic stays correct
 * if two regions ever touch).
 *
 * Top/bottom edges → fence-h rotation 0
 * Left/right edges → fence-h rotation 90° (Math.PI / 2)
 */
function computeFences(): readonly FenceTile[] {
  const out: FenceTile[] = [];
  // A fence is only drawn where the farm meets another LAND region (not a road
  // entry, not the open ocean). Ocean-facing margins are walls, not fences.
  const isLandRegion = (x: number, y: number): boolean =>
    regionAt(x, y) !== null;
  for (const region of REGIONS) {
    if (region.kind !== "farm") continue;
    const { minX, minY, maxX, maxY } = region.bounds;

    // Top edge (ty = minY). Neighbor outside is (tx, minY - 1).
    for (let tx = minX; tx <= maxX; tx++) {
      if (!isLandRegion(tx, minY - 1)) continue;
      out.push({ tx, ty: minY, rotation: 0 });
    }
    // Bottom edge (ty = maxY). Neighbor outside is (tx, maxY + 1).
    for (let tx = minX; tx <= maxX; tx++) {
      if (!isLandRegion(tx, maxY + 1)) continue;
      out.push({ tx, ty: maxY, rotation: 0 });
    }
    // Left edge (tx = minX). Neighbor outside is (minX - 1, ty). Skip the
    // corners (already drawn by top/bottom passes).
    for (let ty = minY + 1; ty <= maxY - 1; ty++) {
      if (!isLandRegion(minX - 1, ty)) continue;
      out.push({ tx: minX, ty, rotation: Math.PI / 2 });
    }
    // Right edge (tx = maxX).
    for (let ty = minY + 1; ty <= maxY - 1; ty++) {
      if (!isLandRegion(maxX + 1, ty)) continue;
      out.push({ tx: maxX, ty, rotation: Math.PI / 2 });
    }
  }
  return out;
}

export const FENCES: readonly FenceTile[] = computeFences();

// ── Walls ────────────────────────────────────────────────────────────────────

/**
 * Compute island wall tiles: every REGION-interior LAND tile that borders the
 * OCEAN (a non-walkable tile) gets an edge band on the side facing the water —
 * so every island is ringed by a margin matching its region's material (see
 * `edgeFrame`). A tile with ocean on several sides emits one band per side.
 *
 * This deliberately covers only region tiles, never ROAD tiles: the 2-wide
 * bridges that connect islands are road-only (`regionAt === null`) and stay
 * open, so the wall never seals off a bridge mouth. Each band is authored
 * top-edge-up and rotated to face the adjacent ocean, matching `computeShores`'
 * rotation convention:
 *   above (−Y) → 0, right (+X) → 90°, below (+Y) → 180°, left (−X) → 270°.
 */
function computeWalls(): readonly WallTile[] {
  const out: WallTile[] = [];
  const dirs: Array<[number, number, number]> = [
    [0, -1, 0],
    [1, 0, Math.PI / 2],
    [0, 1, Math.PI],
    [-1, 0, (3 * Math.PI) / 2],
  ];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      const region = regionAt(tx, ty);
      if (region === null) continue; // only region land gets a wall
      const frame = edgeFrame(region);
      for (const [dx, dy, rotation] of dirs) {
        const nx = tx + dx;
        const ny = ty + dy;
        // Off-grid OR non-walkable neighbor ⇒ that side faces ocean.
        const neighborIsOcean =
          nx < 0 || ny < 0 || nx >= WORLD_WIDTH || ny >= WORLD_HEIGHT || !isWalkable(nx, ny);
        if (neighborIsOcean) out.push({ tx, ty, rotation, frame });
      }
    }
  }
  return out;
}

export const WALLS: readonly WallTile[] = computeWalls();

// ── Shores ───────────────────────────────────────────────────────────────────

/**
 * Compute shoreline overlay tiles: every LAND tile (walkable) that borders the
 * OCEAN (a non-walkable tile, which renders as ocean) gets a foam/sand band on
 * the edge facing the water. The band sprite (`tile/shore`) is authored along
 * the tile's top edge and rotated to face the adjacent ocean. A land tile with
 * ocean on multiple sides emits one band per ocean side.
 *
 * Rotation by neighbor direction (band faces "up" at rotation 0):
 *   above (−Y) → 0, right (+X) → 90°, below (+Y) → 180°, left (−X) → 270°.
 */
function computeShores(): readonly ShoreTile[] {
  const out: ShoreTile[] = [];
  const dirs: Array<[number, number, number]> = [
    [0, -1, 0],
    [1, 0, Math.PI / 2],
    [0, 1, Math.PI],
    [-1, 0, (3 * Math.PI) / 2],
  ];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (!isWalkable(tx, ty)) continue; // only land tiles get a shore
      for (const [dx, dy, rotation] of dirs) {
        const nx = tx + dx;
        const ny = ty + dy;
        // Off-grid OR non-walkable neighbor ⇒ that side faces ocean.
        const neighborIsOcean =
          nx < 0 || ny < 0 || nx >= WORLD_WIDTH || ny >= WORLD_HEIGHT || !isWalkable(nx, ny);
        if (neighborIsOcean) out.push({ tx, ty, rotation });
      }
    }
  }
  return out;
}

export const SHORES: readonly ShoreTile[] = computeShores();

// ── Bridges ──────────────────────────────────────────────────────────────────

/**
 * Compute bridge tiles: every ROAD-only walkable tile (region === null) that
 * borders the ocean. These are the corridors that connect the islands across
 * water — without a deck they read as a dirt path floating on the sea, so we
 * draw a plank bridge instead of `tile/path`.
 *
 * Orientation: the bridge deck is authored HORIZONTAL (rails on the top/bottom
 * long edges, you walk left↔right). We rotate it 90° when the corridor runs
 * vertically — detected by comparing how the tile connects to its neighbours:
 * if the road continues up/down (walkable) but is open to ocean left/right, the
 * span is vertical. Ties default to horizontal.
 */
export function isBridge(tx: number, ty: number): boolean {
  if (!isWalkable(tx, ty)) return false;
  if (regionAt(tx, ty) !== null) return false; // region interiors are land
  // Touches ocean on at least one side ⇒ it's spanning water.
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const nx = tx + dx;
    const ny = ty + dy;
    const off = nx < 0 || ny < 0 || nx >= WORLD_WIDTH || ny >= WORLD_HEIGHT;
    if (off || !isWalkable(nx, ny)) return true;
  }
  return false;
}

function computeBridges(): readonly BridgeTile[] {
  const key = (x: number, y: number) => y * WORLD_WIDTH + x;
  // Pass 1: every road tile that directly touches ocean.
  const deck = new Set<number>();
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isBridge(tx, ty)) deck.add(key(tx, ty));
    }
  }
  const oceanOrDeck = (x: number, y: number): boolean => {
    const off = x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT;
    if (off || !isWalkable(x, y)) return true; // ocean
    return deck.has(key(x, y));
  };
  // Pass 2 (fixpoint): a road tile flanked on BOTH sides of an axis by
  // ocean-or-deck is itself part of the span (fills the interior of a wide
  // crossing the edge-only pass-1 misses). Repeat until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (deck.has(key(tx, ty))) continue;
        if (!isWalkable(tx, ty) || regionAt(tx, ty) !== null) continue; // road-only
        const hSpan = oceanOrDeck(tx - 1, ty) && oceanOrDeck(tx + 1, ty);
        const vSpan = oceanOrDeck(tx, ty - 1) && oceanOrDeck(tx, ty + 1);
        if (hSpan || vSpan) {
          deck.add(key(tx, ty));
          changed = true;
        }
      }
    }
  }
  // Emit with a per-tile rotation from the span direction.
  const out: BridgeTile[] = [];
  for (const k of deck) {
    const tx = k % WORLD_WIDTH;
    const ty = Math.floor(k / WORLD_WIDTH);
    const vertical = isWalkable(tx, ty - 1) || isWalkable(tx, ty + 1);
    const horizontal = isWalkable(tx - 1, ty) || isWalkable(tx + 1, ty);
    const rotation = vertical && !horizontal ? Math.PI / 2 : 0;
    out.push({ tx, ty, rotation });
  }
  return out;
}

export const BRIDGES: readonly BridgeTile[] = computeBridges();

/** Fast lookup so backdropFrame can suppress `tile/path` on bridge tiles. */
export const BRIDGE_SET: ReadonlySet<number> = new Set(
  BRIDGES.map((b) => b.ty * WORLD_WIDTH + b.tx),
);

// ── Cliff skirts (brief 65) ───────────────────────────────────────────────────

/**
 * Compute cliff-face tiles for the `TALL_ISLANDS` set (brief 65). For each
 * tall island we walk its southern coastline — every land tile (tx, maxY) whose
 * southern neighbour (tx, maxY+1) is ocean (non-walkable, in-grid) — and emit
 * cliff-face sprites on those ocean tiles. Two-row islands get a second row at
 * (tx, maxY+2) as well.
 *
 * Layer: 2 (same as coral / set-pieces, above shore foam at 1, below bridges at
 * 3). Cliffs are fully opaque so they read clearly; coral is seeded to open water
 * away from shores, so overlap with coral is rare.
 *
 * Corner pieces (tile/cliff-face-left / -right): the leftmost / rightmost tile
 * of each row gets a corner frame so the cliff terminates naturally instead of
 * cutting off abruptly.
 *
 * Exclusions — bridges and boats are unaffected because:
 *  - We only emit on non-walkable (ocean) tiles; bridge road tiles are walkable
 *    and therefore automatically excluded.
 *  - TALL_ISLANDS was chosen so none has a bridge exiting its south face
 *    (verified by inspection: shrine/waterfall bridges go E/W; heritage-ruin
 *    bridge to quarry-north goes N/E horizontally; quarry-north's bridges go
 *    W/E/N — none exit southward from any of these four islands).
 *  - Fishing-isle boat docks/lanes are at y≥113; fishing-isle is NOT in
 *    TALL_ISLANDS, so no overlap.
 */
function computeCliffs(): readonly CliffTile[] {
  // Pass 1 — collect all cliff positions so corner detection works.
  type CliffPos = { tx: number; ty: number; row: number };
  const allPositions: CliffPos[] = [];

  for (const { region, rows } of TALL_ISLANDS) {
    const reg = REGIONS.find((r) => r.id === region);
    if (!reg) continue;
    const { minX, maxX, maxY } = reg.bounds;

    for (let tx = minX; tx <= maxX; tx++) {
      for (let row = 0; row < rows; row++) {
        const ty = maxY + 1 + row;
        if (ty >= WORLD_HEIGHT) continue;   // off-grid
        if (isWalkable(tx, ty)) continue;   // bridge / walkable tile — skip
        allPositions.push({ tx, ty, row });
      }
    }
  }

  // Pass 2 — fast lookup for corner detection.
  const cliffKey = (x: number, y: number) => y * WORLD_WIDTH + x;
  const cliffSet = new Set(allPositions.map((p) => cliffKey(p.tx, p.ty)));

  // Pass 3 — emit CliffTile with the correct frame (corner or variant).
  const out: CliffTile[] = [];
  for (const { tx, ty, row } of allPositions) {
    const hasLeft  = cliffSet.has(cliffKey(tx - 1, ty));
    const hasRight = cliffSet.has(cliffKey(tx + 1, ty));
    let frame: string;
    if (!hasLeft) {
      frame = "tile/cliff-face-left";
    } else if (!hasRight) {
      frame = "tile/cliff-face-right";
    } else {
      frame = `tile/cliff-face-${cliffVariant(tx, ty)}`;
    }
    out.push({ tx, ty, frame, row });
  }
  return out;
}

export const CLIFFS: readonly CliffTile[] = computeCliffs();

/** Fast lookup: cliff tile positions (ty*WORLD_WIDTH+tx). Used to suppress
 *  coastline foam bubbles off cliff tiles so bubbles don't float mid-cliff. */
export const CLIFF_SET: ReadonlySet<number> = new Set(
  CLIFFS.map((c) => c.ty * WORLD_WIDTH + c.tx),
);

// ── Ocean + coastline tiles ───────────────────────────────────────────────────

/**
 * In-world ocean tiles (non-walkable tiles inside the grid). The water surface
 * itself is now a single scrolling pattern (see `Canvas2dRenderer`), so this is
 * no longer used to draw per-cell foam — kept as a general ocean-tile query.
 * Coastline bubbles use `COASTLINE_BUBBLE_TILES` instead. Out-of-grid water
 * (beyond the world edge) is covered by the renderer's ocean clearColor.
 */
export const OCEAN_TILES: ReadonlyArray<{ tx: number; ty: number }> = (() => {
  const out: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (!isWalkable(tx, ty)) out.push({ tx, ty });
    }
  }
  return out;
})();

/**
 * Coastline bubble tiles: in-grid OCEAN tiles that touch LAND on at least one
 * of the four sides. The render loop draws sparse animated foam bubbles only on
 * these (culled to the viewport) — surf reads naturally at the shore, and it's
 * tens of draws instead of one per water cell. The flowing water pattern
 * handles the open sea; bubbles are an accent on top of it.
 *
 * brief 65: cliff tiles are excluded — foam bubbles floating mid-cliff would
 * look wrong. CLIFF_SET is computed just before this (above) so we can filter
 * here without touching the farm-valley render loop.
 */
export const COASTLINE_BUBBLE_TILES: ReadonlyArray<{ tx: number; ty: number }> = (() => {
  const out: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isWalkable(tx, ty)) continue; // bubbles sit on ocean, not land
      if (CLIFF_SET.has(ty * WORLD_WIDTH + tx)) continue; // brief 65: no bubbles on cliff faces
      const touchesLand =
        isWalkable(tx, ty - 1) ||
        isWalkable(tx, ty + 1) ||
        isWalkable(tx - 1, ty) ||
        isWalkable(tx + 1, ty);
      if (touchesLand) out.push({ tx, ty });
    }
  }
  return out;
})();

// ── Coral ────────────────────────────────────────────────────────────────────

/**
 * Coral is drawn semi-transparent so it reads as resting DEEP below the water
 * surface — the flowing water shows through and the muted shapes look submerged
 * rather than sitting on top of the sea. Low value (≈0.4) keeps the reefs a
 * quiet seabed accent, not a bright object.
 */
const CORAL_ALPHA = 0.4;

/**
 * Compute coral-zone tiles: connected clusters of decorative coral on OPEN-WATER
 * ocean tiles, AUTOTILED so each cluster reads as ONE continuous seabed texture
 * rather than independent per-tile stamps. A candidate tile must be (a) ocean
 * (non-walkable), and (b) not touch any land/bridge on the 8 surrounding tiles —
 * so zones sit out in the open sea, clear of the shore foam (`computeShores`)
 * and island walls rather than crowding the coastline. We grow a handful of
 * seeded clusters, then pick each cell's frame from the coral autotile set by
 * how its 4-neighbours are also coral:
 *   - 4 coral neighbours        → `tile/coral-fill` (full-bleed interior; seams
 *                                  with neighbouring fills into one mass)
 *   - one open-water side       → `tile/coral-edge`, rotated to face the water
 *   - two open-water sides that
 *     share a corner            → `tile/coral-corner`, rotated to the open corner
 * The fill tile covers the whole cell edge-to-edge, so adjacent interior cells
 * meet with no seam and the patch looks like a single big reef.
 *
 * This is purely visual (coral sits on non-walkable tiles and never affects
 * walkability/pathfinding, exactly like the bubble fishing-spots). It's computed
 * once at module load with a fixed seed, so the layout is deterministic and
 * stable across runs (no `Math.random`).
 */
function computeCoral(): readonly CoralTile[] {
  // Open-water candidates: ocean tiles with no walkable neighbour in the 8-ring.
  const candidates: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isWalkable(tx, ty)) continue; // coral sits on ocean
      let nearLand = false;
      for (let dy = -1; dy <= 1 && !nearLand; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (isWalkable(tx + dx, ty + dy)) {
            nearLand = true;
            break;
          }
        }
      }
      if (!nearLand) candidates.push({ tx, ty });
    }
  }

  // A tiny seeded LCG so cluster placement is deterministic (render-only; we
  // deliberately avoid Math.random so the baked layout never shifts run-to-run).
  let seed = 0x9e3779b1 >>> 0;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  // Fewer but BIGGER, COMPACT clusters so each zone is a chunky connected mass
  // with a real interior (the autotiling only reads as "one texture" when many
  // cells have coral on all 4 sides → fill tiles). We grow each cluster as a
  // near-circular blob: from a random seed, repeatedly add the still-free
  // candidate CLOSEST to the seed (squared-distance), so the patch fills in
  // round rather than snaking off in a thin line.
  const CLUSTERS = 8;
  const taken = new Set<number>();
  const key = (x: number, y: number) => y * WORLD_WIDTH + x;
  const candidateSet = new Set(candidates.map((c) => key(c.tx, c.ty)));

  for (let c = 0; c < CLUSTERS && candidates.length > 0; c++) {
    const seedTile = candidates[Math.floor(rand() * candidates.length)]!;
    // Target a chunky cluster (10–17 tiles → a ~3-tile-radius blob with interior).
    const size = 10 + Math.floor(rand() * 8);
    // Frontier = free candidates adjacent to the cluster so far; we always pop
    // the one nearest the seed to keep the blob compact and roughly round.
    const frontier = new Map<number, { tx: number; ty: number }>();
    const dist2 = (t: { tx: number; ty: number }) =>
      (t.tx - seedTile.tx) ** 2 + (t.ty - seedTile.ty) ** 2;
    const addNeighbours = (t: { tx: number; ty: number }) => {
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const nx = t.tx + dx;
        const ny = t.ty + dy;
        const nk = key(nx, ny);
        if (candidateSet.has(nk) && !taken.has(nk) && !frontier.has(nk)) {
          frontier.set(nk, { tx: nx, ty: ny });
        }
      }
    };
    const sk = key(seedTile.tx, seedTile.ty);
    if (taken.has(sk)) continue; // seed already used by an earlier cluster
    taken.add(sk);
    addNeighbours(seedTile);
    let placed = 1;
    while (frontier.size > 0 && placed < size) {
      let bestK = -1;
      let best: { tx: number; ty: number } | null = null;
      let bestD = Infinity;
      for (const [fk, ft] of frontier) {
        const d = dist2(ft);
        if (d < bestD) { bestD = d; bestK = fk; best = ft; }
      }
      frontier.delete(bestK);
      if (best === null || taken.has(bestK)) continue;
      taken.add(bestK);
      placed++;
      addNeighbours(best);
    }
  }

  // Autotile pass: pick frame + rotation per cell from its coral neighbours.
  // Direction order matches the wall/shore rotation convention (band/fade faces
  // "up" at rotation 0): up=−Y→0, right=+X→90°, down=+Y→180°, left=−X→270°.
  const HALF_PI = Math.PI / 2;
  const isCoral = (x: number, y: number) => taken.has(key(x, y));
  const out: CoralTile[] = [];
  for (const k of taken) {
    const tx = k % WORLD_WIDTH;
    const ty = Math.floor(k / WORLD_WIDTH);
    const up = isCoral(tx, ty - 1);
    const right = isCoral(tx + 1, ty);
    const down = isCoral(tx, ty + 1);
    const left = isCoral(tx - 1, ty);
    const openCount = (up ? 0 : 1) + (right ? 0 : 1) + (down ? 0 : 1) + (left ? 0 : 1);

    if (openCount === 0) {
      out.push({ tx, ty, frame: "tile/coral-fill", rotation: 0 });
      continue;
    }
    // A convex corner: exactly two open sides that are adjacent (share a corner).
    // The corner tile fades the TOP-LEFT quadrant at rotation 0, i.e. open on the
    // up+left sides; rotate so the fade faces whichever pair is open.
    if (openCount === 2) {
      if (!up && !left) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: 0 }); continue; }
      if (!up && !right) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: HALF_PI }); continue; }
      if (!down && !right) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: 2 * HALF_PI }); continue; }
      if (!down && !left) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: 3 * HALF_PI }); continue; }
      // Two OPPOSITE open sides (a 1-wide neck) — treat as an edge facing up.
    }
    // Edge: fade faces the (first) open side. The edge tile fades its TOP at
    // rotation 0, so rotate to point the fade at the open-water side.
    const rotation = !up ? 0 : !right ? HALF_PI : !down ? 2 * HALF_PI : 3 * HALF_PI;
    out.push({ tx, ty, frame: "tile/coral-edge", rotation });
  }
  return out;
}

export const CORAL: readonly CoralTile[] = computeCoral();

// ── Big structures ────────────────────────────────────────────────────────────

/**
 * Large multi-tile static buildings baked into the static layer. `baseTileX` is
 * the LEFT tile column the sprite is centered-over (sprite is `wPx` wide, so a
 * 32px sprite spans `baseTileX`..`baseTileX+1`); `baseTileY` is the bottom tile
 * row the building stands on. See the bake loop in `iterStaticSprites` for the
 * bottom-anchor math. Placed on the otherwise-empty top rows of each craft
 * island so the work-yard props/NPC sit in the open ground in front.
 */
export const BIG_STRUCTURES: ReadonlyArray<{
  frame: string;
  baseTileX: number;
  baseTileY: number;
  wPx: number;
  hPx: number;
}> = [
  // Blacksmith forge-house — east half of the blacksmith island (x93–102),
  // spanning tiles x99–100, standing on row y78 (rises into y76–78). Kept off the
  // x93–94 road spine (see region-setup) so the island stays traversable.
  { frame: "structure/forge-house", baseTileX: 99, baseTileY: 78, wPx: 32, hPx: 48 },
  // Carpenter's workshop — WEST strip of the carpenter island (x59–68), spanning
  // tiles x59–60 (left of the x61–62 road spine), standing on row y78 (rises into
  // y76–78). Sitting on the narrow west strip keeps the whole east half an open
  // yard so the island interior never gets walled off (the village bridge lands
  // on the east edge x68).
  { frame: "structure/carpenter-workshop", baseTileX: 59, baseTileY: 78, wPx: 32, hPx: 48 },
];

// ── Fishing statics (brief 48) ────────────────────────────────────────────────

/** A single static decoration tile (frame at a tile coordinate). */
export interface FishingStaticTile {
  tx: number;
  ty: number;
  frame: string;
}

/**
 * Static visual decorations for the Boats & Coral Fishing feature (brief 48).
 * Two kinds:
 *   - A moored `structure/boat` at each reef's dock tile (south edge of the
 *     fishing isle, where farmers board).
 *   - A `tile/coral-reef` marker at each reef tile (the fishable ocean tile),
 *     drawn at full opacity so it's clearly visible through the water.
 * Both are purely visual — they sit on already-established walkable/non-walkable
 * tiles and never affect sim or pathfinding.
 */
export const FISHING_STATICS: readonly FishingStaticTile[] = (() => {
  const out: FishingStaticTile[] = [];
  for (const reef of CORAL_REEFS) {
    out.push({ tx: reef.dock.x, ty: reef.dock.y, frame: "structure/boat" });
    out.push({ tx: reef.reef.x, ty: reef.reef.y, frame: "tile/coral-reef" });
  }
  return out;
})();

export { CORAL_ALPHA };
