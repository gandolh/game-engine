import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  REGIONS,
  regionAt,
  isWalkable,
  type RegionId,
} from "../world/regions";
import { CORAL_REEFS } from "../world/coral";

/** Islands that get a cliff skirt south of their coastline. Render-only; cliffs sit on non-walkable ocean. */
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

/** Island edge material: farms+fishing = sand, carpentry = wood, all others = stone. */
export function edgeFrame(region: RegionId): string {
  if (region.startsWith("farm-")) return "tile/shore-sand";
  if (region === "fishing-isle" || region === "fishing-isle-2") return "tile/shore-sand";
  if (region === "carpentry") return "tile/wall-wood";
  // blacksmith, quarry-*, village, forests, mill, wells, grove, ice-pond, …
  return "tile/wall";
}

// Fences: farm borders against other land regions only; ocean margins use walls.
function computeFences(): readonly FenceTile[] {
  const out: FenceTile[] = [];
  const isLandRegion = (x: number, y: number): boolean =>
    regionAt(x, y) !== null;
  for (const region of REGIONS) {
    if (region.kind !== "farm") continue;
    const { minX, minY, maxX, maxY } = region.bounds;

    for (let tx = minX; tx <= maxX; tx++) {
      if (!isLandRegion(tx, minY - 1)) continue;
      out.push({ tx, ty: minY, rotation: 0 });
    }
    for (let tx = minX; tx <= maxX; tx++) {
      if (!isLandRegion(tx, maxY + 1)) continue;
      out.push({ tx, ty: maxY, rotation: 0 });
    }
    // Skip corners (drawn by top/bottom passes).
    for (let ty = minY + 1; ty <= maxY - 1; ty++) {
      if (!isLandRegion(minX - 1, ty)) continue;
      out.push({ tx: minX, ty, rotation: Math.PI / 2 });
    }
    for (let ty = minY + 1; ty <= maxY - 1; ty++) {
      if (!isLandRegion(maxX + 1, ty)) continue;
      out.push({ tx: maxX, ty, rotation: Math.PI / 2 });
    }
  }
  return out;
}

export const FENCES: readonly FenceTile[] = computeFences();

// Walls: material band on land tiles bordering ocean. Road tiles excluded (bridge mouths open).
// Rotation: −Y=0, +X=90°, +Y=180°, −X=270°.
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
          const neighborIsOcean =
          nx < 0 || ny < 0 || nx >= WORLD_WIDTH || ny >= WORLD_HEIGHT || !isWalkable(nx, ny);
        if (neighborIsOcean) out.push({ tx, ty, rotation, frame });
      }
    }
  }
  return out;
}

export const WALLS: readonly WallTile[] = computeWalls();

/**
 * South-facing wall bands are excluded from the static bake and pushed each frame as occluders
 * (y-sorted at their base), so a farmer behind the parapet is covered correctly.
 * Sandy beach bands stay baked — you stand ON a beach, not behind it.
 */
export function isOccluderWall(w: WallTile): boolean {
  return w.rotation === Math.PI && w.frame !== "tile/shore-sand";
}

export const OCCLUDER_WALLS: readonly WallTile[] = WALLS.filter(isOccluderWall);

// Shores: foam band on land tiles facing ocean. Authored top-up at rotation 0.
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
      if (!isWalkable(tx, ty)) continue;
      for (const [dx, dy, rotation] of dirs) {
        const nx = tx + dx;
        const ny = ty + dy;
        const neighborIsOcean =
          nx < 0 || ny < 0 || nx >= WORLD_WIDTH || ny >= WORLD_HEIGHT || !isWalkable(nx, ny);
        if (neighborIsOcean) out.push({ tx, ty, rotation });
      }
    }
  }
  return out;
}

export const SHORES: readonly ShoreTile[] = computeShores();

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

/** Fast set to suppress `tile/path` on bridge tiles. */
export const BRIDGE_SET: ReadonlySet<number> = new Set(
  BRIDGES.map((b) => b.ty * WORLD_WIDTH + b.tx),
);

function computeCliffs(): readonly CliffTile[] {
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

  const cliffKey = (x: number, y: number) => y * WORLD_WIDTH + x;
  const cliffSet = new Set(allPositions.map((p) => cliffKey(p.tx, p.ty)));
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

/** Cliff tile positions. Used to suppress foam bubbles on cliff faces. */
export const CLIFF_SET: ReadonlySet<number> = new Set(
  CLIFFS.map((c) => c.ty * WORLD_WIDTH + c.tx),
);

/** All non-walkable in-grid tiles. No longer used for per-cell rendering; kept for ocean-tile queries. */
export const OCEAN_TILES: ReadonlyArray<{ tx: number; ty: number }> = (() => {
  const out: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (!isWalkable(tx, ty)) out.push({ tx, ty });
    }
  }
  return out;
})();

/** Distance (in tiles) from each OCEAN tile to the nearest land, via multi-source BFS seeded from
 *  every ocean tile that touches land (4-connected). 1 = touching land, 2 = one tile out, … Land and
 *  out-of-grid read 0. Used to paint a shallow-water depth band hugging the coast (render-only).
 *  Capped at COAST_DEPTH_MAX since only the near-shore ring is tinted — open ocean stays the base color. */
export const COAST_DEPTH_MAX = 4;
const OCEAN_DEPTH: Int16Array = (() => {
  const depth = new Int16Array(WORLD_WIDTH * WORLD_HEIGHT); // 0 = land / not-yet-visited
  const queue: number[] = [];
  // Seed: ocean tiles with a land 4-neighbour are depth 1.
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isWalkable(tx, ty)) continue; // land
      const touchesLand =
        isWalkable(tx, ty - 1) || isWalkable(tx, ty + 1) ||
        isWalkable(tx - 1, ty) || isWalkable(tx + 1, ty);
      if (touchesLand) {
        depth[ty * WORLD_WIDTH + tx] = 1;
        queue.push(ty * WORLD_WIDTH + tx);
      }
    }
  }
  // BFS outward through ocean only, stopping at COAST_DEPTH_MAX.
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const d = depth[i]!;
    if (d >= COAST_DEPTH_MAX) continue;
    const x = i % WORLD_WIDTH;
    const y = (i - x) / WORLD_WIDTH;
    const nbrs = [
      x + 1 < WORLD_WIDTH ? i + 1 : -1,
      x - 1 >= 0 ? i - 1 : -1,
      y + 1 < WORLD_HEIGHT ? i + WORLD_WIDTH : -1,
      y - 1 >= 0 ? i - WORLD_WIDTH : -1,
    ];
    for (const ni of nbrs) {
      if (ni < 0) continue;
      if (depth[ni] !== 0) continue;        // visited or land(=0 but land never enqueued)
      const nx = ni % WORLD_WIDTH;
      const ny = (ni - nx) / WORLD_WIDTH;
      if (isWalkable(nx, ny)) continue;      // don't bleed onto land
      depth[ni] = d + 1;
      queue.push(ni);
    }
  }
  return depth;
})();

/** Distance from ocean tile (tx,ty) to nearest land, 1..COAST_DEPTH_MAX; 0 for land/open ocean/out-of-grid. */
export function oceanDepthAt(tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) return 0;
  return OCEAN_DEPTH[ty * WORLD_WIDTH + tx]!;
}

/** Ocean tiles touching land — animated foam bubbles drawn here. Cliff tiles excluded. */
export const COASTLINE_BUBBLE_TILES: ReadonlyArray<{ tx: number; ty: number }> = (() => {
  const out: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isWalkable(tx, ty)) continue; // bubbles sit on ocean, not land
      if (CLIFF_SET.has(ty * WORLD_WIDTH + tx)) continue;
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

// Coral alpha: semi-transparent so water shows through.
const CORAL_ALPHA = 0.4;

// Coral clusters on open-water tiles (no 8-ring land neighbor). Fixed-seed, no Math.random.
function computeCoral(): readonly CoralTile[] {
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

  let seed = 0x9e3779b1 >>> 0;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const CLUSTERS = 8;
  const taken = new Set<number>();
  const key = (x: number, y: number) => y * WORLD_WIDTH + x;
  const candidateSet = new Set(candidates.map((c) => key(c.tx, c.ty)));

  for (let c = 0; c < CLUSTERS && candidates.length > 0; c++) {
    const seedTile = candidates[Math.floor(rand() * candidates.length)]!;
    const size = 10 + Math.floor(rand() * 8);
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
    // Corner tile: TOP-LEFT open at rotation 0; rotate to match the open pair.
    if (openCount === 2) {
      if (!up && !left) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: 0 }); continue; }
      if (!up && !right) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: HALF_PI }); continue; }
      if (!down && !right) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: 2 * HALF_PI }); continue; }
      if (!down && !left) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: 3 * HALF_PI }); continue; }
      // Opposite open sides (1-wide neck) — fall through to edge.
    }
    const rotation = !up ? 0 : !right ? HALF_PI : !down ? 2 * HALF_PI : 3 * HALF_PI;
    out.push({ tx, ty, frame: "tile/coral-edge", rotation });
  }
  return out;
}

export const CORAL: readonly CoralTile[] = computeCoral();

/**
 * Maps a farm region id to its baked cottage frame. Pure helper — see brief 77.
 * Named farms map by owner personality; procedural `farm-{i}` farms map by (i % 4),
 * matching EXTRA_FARMER_TEMPLATES order (0 conservative, 1 aggressive, 2 hoarder, 3 opportunist).
 */
export function farmCottageFrame(regionId: string): string {
  switch (regionId) {
    case "farm-pip":
      return "structure/cottage-pip";
    case "farm-cora":
      return "structure/cottage-conservative";
    case "farm-atticus":
      return "structure/cottage-aggressive";
    case "farm-hannah":
      return "structure/cottage-hoarder";
    case "farm-otto":
      return "structure/cottage-opportunist";
    default: {
      const m = /^farm-(\d+)$/.exec(regionId);
      const i = m ? Number(m[1]) : 0;
      const byMod = [
        "structure/cottage-conservative",
        "structure/cottage-aggressive",
        "structure/cottage-hoarder",
        "structure/cottage-opportunist",
      ] as const;
      return byMod[i % 4]!;
    }
  }
}

interface BigStructure {
  frame: string;
  baseTileX: number;
  baseTileY: number;
  wPx: number;
  hPx: number;
}

/** Large static buildings baked into the static layer. baseTileX = left col, baseTileY = bottom row. */
export const BIG_STRUCTURES: ReadonlyArray<BigStructure> = [
  { frame: "structure/forge-house", baseTileX: 99, baseTileY: 78, wPx: 32, hPx: 48 },
  { frame: "structure/carpenter-workshop", baseTileX: 59, baseTileY: 78, wPx: 32, hPx: 48 },
  // Weather-station island: building (3×2 tiles) left side, antenna mast (1×4 tiles) right side.
  // Taller (hPx 48) building — rises upward into tile rows 120-122, within island bounds (minY 119).
  { frame: "structure/weather-station", baseTileX: 109, baseTileY: 122, wPx: 48, hPx: 48 },
  { frame: "structure/weather-antenna", baseTileX: 114, baseTileY: 122, wPx: 16, hPx: 64 },
  // One baked 3D cottage per farm region, bottom-anchored at the SE corner the old home used
  // (maxX-1,maxY-1 in setup.ts). 32px (2 tiles) wide ⇒ baseTileX = maxX-2.
  ...REGIONS.filter((r) => r.kind === "farm").map(
    (r): BigStructure => ({
      frame: farmCottageFrame(r.id),
      baseTileX: r.bounds.maxX - 2,
      baseTileY: r.bounds.maxY - 1,
      wPx: 32,
      hPx: 48,
    }),
  ),
];

/** A single static decoration tile (frame at a tile coordinate). */
export interface FishingStaticTile {
  tx: number;
  ty: number;
  frame: string;
}

/** Boat at each dock + reef marker at each reef tile. Purely visual; no sim coupling. */
export const FISHING_STATICS: readonly FishingStaticTile[] = (() => {
  const out: FishingStaticTile[] = [];
  for (const reef of CORAL_REEFS) {
    out.push({ tx: reef.dock.x, ty: reef.dock.y, frame: "structure/boat" });
    out.push({ tx: reef.reef.x, ty: reef.reef.y, frame: "tile/coral-reef" });
  }
  return out;
})();

export { CORAL_ALPHA };
