import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  REGIONS,
  regionAt,
  isWalkable,
  scaleAroundNearestIsland,
  snapPropToLand,
  type RegionId,
} from "../world/regions";
import { CORAL_REEFS } from "../world/coral";
import { PORTS } from "../world/ports";

export const TALL_ISLANDS: ReadonlyArray<{ region: RegionId; rows: 1 | 2 }> = [
  { region: "heritage-ruin",  rows: 1 }, 
  { region: "waterfall",      rows: 2 }, 
  { region: "shrine",         rows: 1 }, 
  { region: "quarry-north",   rows: 1 }, 
];

export interface CliffTile {
  tx: number;
  ty: number;
  frame: string;
  row: number; 
}

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

  runsVertical: boolean;

  spanT: number;
}

export interface CoralTile {
  tx: number;
  ty: number;
  frame: string;
  rotation: number;
}

export function edgeFrame(region: RegionId): string {
  if (region.startsWith("farm-")) return "tile/shore-sand";
  if (region === "fishing-isle" || region === "fishing-isle-2") return "tile/shore-sand";
  if (region === "carpentry") return "tile/wall-wood";

  return "tile/wall";
}

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
      if (region === null) continue; 
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

export function isOccluderWall(w: WallTile): boolean {
  return w.rotation === Math.PI && w.frame !== "tile/shore-sand";
}

export const OCCLUDER_WALLS: readonly WallTile[] = WALLS.filter(isOccluderWall);

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

      if (regionAt(tx, ty) === null) continue;
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

export const SAND_SHORES: readonly ShoreTile[] = SHORES.filter((s) => {
  const region = regionAt(s.tx, s.ty);
  return region !== null && edgeFrame(region) === "tile/shore-sand";
});

export function isBridge(tx: number, ty: number): boolean {
  if (!isWalkable(tx, ty)) return false;
  if (regionAt(tx, ty) !== null) return false; 

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
    if (off || !isWalkable(x, y)) return true; 
    return deck.has(key(x, y));
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (deck.has(key(tx, ty))) continue;
        if (!isWalkable(tx, ty) || regionAt(tx, ty) !== null) continue; 
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

  const deckRun = (tx: number, ty: number, dx: number, dy: number): number => {
    let n = 0;
    let x = tx + dx;
    let y = ty + dy;
    while (deck.has(key(x, y))) { n++; x += dx; y += dy; }
    return n;
  };
  for (const k of deck) {
    const tx = k % WORLD_WIDTH;
    const ty = Math.floor(k / WORLD_WIDTH);
    const vertical = isWalkable(tx, ty - 1) || isWalkable(tx, ty + 1);
    const horizontal = isWalkable(tx - 1, ty) || isWalkable(tx + 1, ty);
    const rotation = vertical && !horizontal ? Math.PI / 2 : 0;

    const vExt = deckRun(tx, ty, 0, -1) + deckRun(tx, ty, 0, 1);
    const hExt = deckRun(tx, ty, -1, 0) + deckRun(tx, ty, 1, 0);
    const runsVertical = vExt !== hExt ? vExt > hExt : (vertical && !horizontal);

    const back = runsVertical ? deckRun(tx, ty, 0, -1) : deckRun(tx, ty, -1, 0);
    const fwd = runsVertical ? deckRun(tx, ty, 0, 1) : deckRun(tx, ty, 1, 0);
    const spanT = back + fwd > 0 ? back / (back + fwd) : 0.5;
    out.push({ tx, ty, rotation, runsVertical, spanT });
  }
  return out;
}

export const BRIDGES: readonly BridgeTile[] = computeBridges();

export const BRIDGE_SET: ReadonlySet<number> = new Set(
  BRIDGES.map((b) => b.ty * WORLD_WIDTH + b.tx),
);

function computeCliffs(): readonly CliffTile[] {
  type CliffPos = { tx: number; ty: number; row: number };
  const allPositions: CliffPos[] = [];

  for (const { region, rows } of TALL_ISLANDS) {
    const reg = REGIONS.find((r) => r.id === region);
    if (!reg) continue;
    const { minX, maxX, minY, maxY } = reg.bounds;

    // Organic masks don't fill the bounds rect, so the bottom land edge varies
    // per column. For each column find the LOWEST land tile y (scan up from
    // maxY) and place cliff rows just below it. Columns with no land are skipped.
    for (let tx = minX; tx <= maxX; tx++) {
      let lowestLandY = -1;
      for (let ty = maxY; ty >= minY; ty--) {
        if (regionAt(tx, ty) === region) { lowestLandY = ty; break; }
      }
      if (lowestLandY < 0) continue; // no land in this column
      for (let row = 0; row < rows; row++) {
        const ty = lowestLandY + 1 + row;
        if (ty >= WORLD_HEIGHT) continue;
        if (isWalkable(tx, ty)) continue;
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

export const CLIFF_SET: ReadonlySet<number> = new Set(
  CLIFFS.map((c) => c.ty * WORLD_WIDTH + c.tx),
);

export const OCEAN_TILES: ReadonlyArray<{ tx: number; ty: number }> = (() => {
  const out: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (!isWalkable(tx, ty)) out.push({ tx, ty });
    }
  }
  return out;
})();

export const COAST_DEPTH_MAX = 4;
const OCEAN_DEPTH: Int16Array = (() => {
  const depth = new Int16Array(WORLD_WIDTH * WORLD_HEIGHT); 
  const queue: number[] = [];

  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isWalkable(tx, ty)) continue; 
      const touchesLand =
        isWalkable(tx, ty - 1) || isWalkable(tx, ty + 1) ||
        isWalkable(tx - 1, ty) || isWalkable(tx + 1, ty);
      if (touchesLand) {
        depth[ty * WORLD_WIDTH + tx] = 1;
        queue.push(ty * WORLD_WIDTH + tx);
      }
    }
  }

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
      if (depth[ni] !== 0) continue;        
      const nx = ni % WORLD_WIDTH;
      const ny = (ni - nx) / WORLD_WIDTH;
      if (isWalkable(nx, ny)) continue;      
      depth[ni] = d + 1;
      queue.push(ni);
    }
  }
  return depth;
})();

export function oceanDepthAt(tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) return 0;
  return OCEAN_DEPTH[ty * WORLD_WIDTH + tx]!;
}

export const GRADIENT_DEPTH_MAX = 14;
const OCEAN_GRADIENT: Float32Array = (() => {
  const grad = new Float32Array(WORLD_WIDTH * WORLD_HEIGHT); 
  const queue: number[] = [];

  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isWalkable(tx, ty)) continue; 
      const touchesLand =
        isWalkable(tx, ty - 1) || isWalkable(tx, ty + 1) ||
        isWalkable(tx - 1, ty) || isWalkable(tx + 1, ty);
      if (touchesLand) {
        grad[ty * WORLD_WIDTH + tx] = 1; 
        queue.push(ty * WORLD_WIDTH + tx);
      }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const d = grad[i]!;
    if (d >= GRADIENT_DEPTH_MAX) continue;
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
      if (grad[ni] !== 0) continue; 
      const nx = ni % WORLD_WIDTH;
      const ny = (ni - nx) / WORLD_WIDTH;
      if (isWalkable(nx, ny)) continue; 
      grad[ni] = d + 1;
      queue.push(ni);
    }
  }

  for (let i = 0; i < grad.length; i++) {
    const d = grad[i]!;
    grad[i] = d > 0 ? (GRADIENT_DEPTH_MAX - d + 1) / GRADIENT_DEPTH_MAX : 0;
  }
  return grad;
})();

export function oceanGradientAt(tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) return 0;
  return OCEAN_GRADIENT[ty * WORLD_WIDTH + tx]!;
}

export const COASTLINE_BUBBLE_TILES: ReadonlyArray<{ tx: number; ty: number }> = (() => {
  const out: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isWalkable(tx, ty)) continue; 
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

const CORAL_ALPHA = 0.55;

function computeCoral(): readonly CoralTile[] {
  const candidates: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isWalkable(tx, ty)) continue; 
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
    if (taken.has(sk)) continue; 
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

  const FILL_VARIANTS = ["tile/coral-fill", "tile/coral-fill-b", "tile/coral-fill-c"] as const;
  const fillFrameFor = (tx: number, ty: number): string => {
    const h = (Math.imul(tx + 1, 0x27d4eb2f) ^ Math.imul(ty + 1, 0x165667b1)) >>> 0;
    return FILL_VARIANTS[h % 3]!;
  };
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
      out.push({ tx, ty, frame: fillFrameFor(tx, ty), rotation: 0 });
      continue;
    }

    if (openCount === 2) {
      if (!up && !left) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: 0 }); continue; }
      if (!up && !right) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: HALF_PI }); continue; }
      if (!down && !right) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: 2 * HALF_PI }); continue; }
      if (!down && !left) { out.push({ tx, ty, frame: "tile/coral-corner", rotation: 3 * HALF_PI }); continue; }

    }
    const rotation = !up ? 0 : !right ? HALF_PI : !down ? 2 * HALF_PI : 3 * HALF_PI;
    out.push({ tx, ty, frame: "tile/coral-edge", rotation });
  }
  return out;
}

export const CORAL: readonly CoralTile[] = computeCoral();

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

function bakedAt(frame: string, x: number, y: number, wPx: number, hPx: number): BigStructure {
  // Scale design coords, then snap the base tile onto real mask land so the
  // structure never floats on a carved-out ocean tile (organic masks, brief 91).
  const t = snapPropToLand(scaleAroundNearestIsland({ x, y }));
  return { frame, baseTileX: t.x, baseTileY: t.y, wPx, hPx };
}

/** Like a literal baked structure, but snaps the (already world-space) base to land. */
function bakedFixed(frame: string, x: number, y: number, wPx: number, hPx: number): BigStructure {
  const t = snapPropToLand({ x, y });
  return { frame, baseTileX: t.x, baseTileY: t.y, wPx, hPx };
}

export const BIG_STRUCTURES: ReadonlyArray<BigStructure> = [
  bakedAt("structure/forge-house", 99, 78, 32, 48),
  bakedAt("structure/carpenter-workshop", 59, 78, 32, 48),

  bakedAt("structure/weather-station", 109, 122, 48, 48),
  bakedAt("structure/weather-antenna", 114, 122, 16, 64),

  bakedAt("decoration/volcano", 77, 16, 96, 96),

  bakedFixed("structure/big-tree", 130, 14, 48, 64),

  bakedAt("decoration/slot-machine", 73, 117, 16, 32),   
  bakedAt("decoration/slot-machine", 75, 117, 16, 32),
  bakedAt("decoration/roulette", 77, 119, 32, 32),        
  bakedAt("decoration/blackjack-table", 73, 122, 32, 24), 
  bakedAt("decoration/dice-table", 80, 119, 32, 24),      
  bakedAt("decoration/shell-game", 78, 124, 32, 24),      

  bakedFixed("decoration/ring-post", 123, 105, 16, 32),
  bakedFixed("decoration/ring-post", 130, 105, 16, 32),
  bakedFixed("decoration/ring-post", 123, 110, 16, 32),
  bakedFixed("decoration/ring-post", 130, 110, 16, 32),
  bakedFixed("decoration/ring-ropes", 124, 104, 32, 16),
  bakedFixed("decoration/ring-ropes", 124, 111, 32, 16),

  // Per-farm cottage base (maxX-2, maxY-1). This tile is pinned as forced-core
  // land by anchors.ts (forcedCoreTiles), so the organic mask never carves it
  // out — no mask-aware snap needed here.
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

export interface FishingStaticTile {
  tx: number;
  ty: number;
  frame: string;
}

export const FISHING_STATICS: readonly FishingStaticTile[] = (() => {
  const out: FishingStaticTile[] = [];
  for (const reef of CORAL_REEFS) {
    out.push({ tx: reef.dock.x, ty: reef.dock.y, frame: "structure/boat" });
    out.push({ tx: reef.reef.x, ty: reef.reef.y, frame: "tile/coral-reef" });
  }
  return out;
})();

export const CASINO_STATICS: readonly FishingStaticTile[] = [
  { x: 75, y: 124, frame: "structure/boat" },
  { x: 77, y: 125, frame: "structure/boat" },
  { x: 79, y: 124, frame: "structure/boat" },
  { x: 81, y: 124, frame: "decoration/buoy" },
].map((s) => {
  const t = scaleAroundNearestIsland({ x: s.x, y: s.y });
  return { tx: t.x, ty: t.y, frame: s.frame };
});

export const PORT_STATICS: readonly FishingStaticTile[] = (() => {
  const out: FishingStaticTile[] = [];
  for (const p of PORTS) {
    out.push({ tx: p.dock.x, ty: p.dock.y, frame: "tile/dock-floor" });
    const moored = p.lane[0];
    if (moored) out.push({ tx: moored.x, ty: moored.y, frame: "structure/boat" });
  }
  return out;
})();

export { CORAL_ALPHA };
