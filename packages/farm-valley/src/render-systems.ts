import type { World } from "@engine/core";
import { Canvas2dRenderer } from "@engine/core";
import type { Canvas2dSprite } from "@engine/core";
import type { GameEntity } from "./components";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  REGIONS,
  TOWN_SQUARE,
  regionAt,
  isWalkable,
  type RegionId,
} from "./world/regions";
import type { Season } from "./protocols/weather";

/**
 * brief 45 — per-season grass tile variant. Selected in `backdropFrame` so the
 * baked static layer shows the season's ground treatment. Re-baked on season
 * change (4× per run; see main.ts). Render-only — no determinism impact.
 */
const SEASON_GRASS: Record<Season, string> = {
  spring: "tile/grass-spring",
  summer: "tile/grass-summer",
  autumn: "tile/grass-autumn",
  winter: "tile/grass-winter",
};

const TILE = 16;

// ── Atlas sheet routing ───────────────────────────────────────────────────────
// Mirrors PREFIX_TO_SHEET in tools/atlas-builder/src/recipes.ts.
// Keep in sync when adding new frame prefixes.
// Design decision: the mapping lives here (runtime) AND in the builder because
// the builder emits the sheets and the runtime routes sprites to them; sharing
// a single source would require the game to import builder code or vice versa
// (both illegal in this monorepo). A build-time test in atlas-builder verifies
// the sets stay consistent.
const FRAME_PREFIX_TO_ATLAS: Readonly<Record<string, string>> = {
  "farmer":     "characters",
  "npc":        "characters",
  "structure":  "buildings",
  "tile":       "terrain",
  "crop":       "crops",
  "decoration": "props",
  "fish":       "items-ui",
  "tool":       "items-ui",
  "indicator":  "items-ui",
  "debug":      "items-ui",
  // brief 42 — livestock + orchard
  "animal":     "characters",
  "product":    "items-ui",
  "fruit":      "items-ui",
};

/**
 * Derive the atlas sheet id for a sprite frame name (e.g. "tile/grass" →
 * "terrain"). Throws if the frame prefix is not mapped so misconfigurations
 * surface immediately rather than producing a silent rendering glitch.
 *
 * Centralised here so every sprite — static backdrop (buildStaticLayerSprites),
 * snapshot (snapshot-builder.ts buildSprites), and dynamic meet-indicator —
 * sets atlasId from the same authoritative mapping.
 */
export function frameToAtlasId(frame: string): string {
  const prefix = frame.split("/")[0];
  const sheetId = FRAME_PREFIX_TO_ATLAS[prefix ?? ""];
  if (sheetId === undefined) {
    throw new Error(
      `frameToAtlasId: unknown prefix "${prefix ?? ""}" in frame "${frame}". Update FRAME_PREFIX_TO_ATLAS.`,
    );
  }
  return sheetId;
}

interface LogicalSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  rotation: number;
  layer: number;
  alpha: number;
}

/**
 * Pick the sprite frame for a farmer entity given the current simulation tick.
 * While `farmer.path` is set (traveling), the frame alternates between walk-a
 * and walk-b every 2 ticks (~100ms at 20 Hz). When idle the base personality
 * frame is returned unchanged.
 *
 * Extracted as a top-level helper so concurrent diffs in the sprite loop can
 * merge mechanically without touching this logic.
 */
export function pickFarmerFrame(entity: GameEntity, tick: number): string {
  const farmer = entity.farmer;
  const baseFrame = entity.sprite?.frame ?? "";
  // AI farmers walk while traveling a path; the player (Pip) has no path, so it
  // walks while it stepped this tick (set by PlayerControlSystem).
  const walking = farmer?.path !== undefined || farmer?.movedThisTick === true;
  if (!walking) return baseFrame;
  const suffix = (tick >> 1) & 1 ? "/walk-b" : "/walk-a";
  return baseFrame + suffix;
}

/**
 * Decide which background frame (if any) a tile gets.
 * - void (non-walkable) → null
 * - road only (no region) → "tile/path"
 * - farm-* → "tile/grass"
 * - village inner square (TOWN_SQUARE) → "tile/market-floor" (decorative stone)
 * - village outer → "tile/dirt"
 * - blacksmith → "tile/forge-floor" (dark stone with heat cracks)
 * - carpentry → "tile/carpentry-floor" (laid stone-slab flooring)
 * - resource-zone → "tile/grass" (same as farms — they're green areas)
 */
function backdropFrame(tx: number, ty: number, season: Season = "spring"): string | null {
  const grassFrame = SEASON_GRASS[season];
  // Non-walkable tiles (out-of-region gaps, world border) are OCEAN. We no
  // longer bake a static ocean tile here — the renderer's animated water
  // pattern fills the whole world rect under the static layer, so we leave
  // these unbaked (null) and let the flowing water show through. Walkability is
  // unaffected (this is purely visual).
  if (!isWalkable(tx, ty)) return null;
  const region = regionAt(tx, ty);
  if (region === null) {
    // Road-only tile. If it spans water it gets a plank bridge deck (drawn as a
    // separate overlay in iterStaticSprites) over the animated water (null
    // base); otherwise a plain dirt path.
    return BRIDGE_SET.has(ty * WORLD_WIDTH + tx) ? null : "tile/path";
  }
  if (region.startsWith("farm-")) return grassFrame;
  if (region === "blacksmith") return "tile/forge-floor";
  if (region === "carpentry") return "tile/carpentry-floor";
  if (region === "forest-north" || region === "forest-south") return grassFrame;
  if (region === "quarry-north" || region === "quarry-south") return "tile/quarry-floor";
  if (region === "mill") return "tile/stone-floor";
  if (region === "well-north" || region === "well-south") return "tile/stone-floor";
  if (region === "mushroom-grove") return "tile/mushroom-floor";
  if (region === "ice-pond") return "tile/ice-floor";
  if (region === "fishing-isle" || region === "fishing-isle-2") return "tile/sand";
  if (region === "village") {
    // Market square gets the decorative floor; outer village stays cobblestone
    if (tx >= TOWN_SQUARE.minX && tx <= TOWN_SQUARE.maxX &&
        ty >= TOWN_SQUARE.minY && ty <= TOWN_SQUARE.maxY) {
      return "tile/market-floor";
    }
    return "tile/dirt";
  }
  return "tile/dirt"; // fallback for any future region
}

interface FenceTile {
  tx: number;
  ty: number;
  rotation: number;
}

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

const FENCES: readonly FenceTile[] = computeFences();

interface WallTile {
  tx: number;
  ty: number;
  rotation: number;
  frame: string;
}

/**
 * The edge material for a region's island margin. Each island reads as its own
 * place, so its shoreline is themed:
 *   farm fields   → soft sandy beach (`tile/shore-sand`)
 *   carpentry     → built wooden bulwark (`tile/wall-wood`)
 *   blacksmith / quarries → hard stone wall (`tile/wall`)
 *   fishing isles → sandy beach (they're sand islands)
 *   everything else → stone wall (a neutral retaining edge)
 */
function edgeFrame(region: RegionId): string {
  if (region.startsWith("farm-")) return "tile/shore-sand";
  if (region === "fishing-isle" || region === "fishing-isle-2") return "tile/shore-sand";
  if (region === "carpentry") return "tile/wall-wood";
  // blacksmith, quarry-*, village, forests, mill, wells, grove, ice-pond, …
  return "tile/wall";
}

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

const WALLS: readonly WallTile[] = computeWalls();

interface ShoreTile {
  tx: number;
  ty: number;
  rotation: number;
}

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

const SHORES: readonly ShoreTile[] = computeShores();

interface BridgeTile {
  tx: number;
  ty: number;
  rotation: number;
}

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
function isBridge(tx: number, ty: number): boolean {
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

const BRIDGES: readonly BridgeTile[] = computeBridges();
/** Fast lookup so backdropFrame can suppress `tile/path` on bridge tiles. */
const BRIDGE_SET: ReadonlySet<number> = new Set(
  BRIDGES.map((b) => b.ty * WORLD_WIDTH + b.tx),
);

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
 */
export const COASTLINE_BUBBLE_TILES: ReadonlyArray<{ tx: number; ty: number }> = (() => {
  const out: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isWalkable(tx, ty)) continue; // bubbles sit on ocean, not land
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

interface CoralTile {
  tx: number;
  ty: number;
  frame: string;
  rotation: number;
}

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

const CORAL: readonly CoralTile[] = computeCoral();

/** The three animated foam frames, cycled for the water shimmer. */
export const FOAM_FRAMES = ["tile/foam-a", "tile/foam-b", "tile/foam-c"] as const;

/**
 * The fishing-spot rising-bubble animation: 3 frames the render loop cycles
 * (A→B→C) so the spot's three bubbles climb to the surface and pop. `-a` is the
 * `structure/fishing-spot` frame the BubbleSystem spawns / the snapshot carries;
 * the render loop swaps the displayed frame to animate it (see main.ts).
 */
export const FISHING_SPOT_FRAMES = [
  "structure/fishing-spot",
  "structure/fishing-spot-b",
  "structure/fishing-spot-c",
] as const;

/** Animated forge-fire frames, cycled in the blacksmith oven's mouth. */
export const FORGE_FIRE_FRAMES = [
  "structure/forge-fire-a",
  "structure/forge-fire-b",
  "structure/forge-fire-c",
] as const;

/** Tile of the blacksmith oven (matches region-setup placeProps). The fire
 *  overlay is drawn here, above the oven body. */
export const FORGE_OVEN_TILE = { x: 62, y: 37 } as const;

/** Animated forge chimney-smoke frames, cycled by the render loop above the
 *  forge-house (see FORGE_CHIMNEY_PX). */
export const FORGE_SMOKE_FRAMES = [
  "structure/forge-smoke-a",
  "structure/forge-smoke-b",
  "structure/forge-smoke-c",
] as const;

/**
 * The static backdrop: tiles + farm fences + plot dirt. These never change
 * after world setup, so they're baked once into the renderer's static layer
 * (see `Canvas2dRenderer.bakeStaticLayer`) instead of re-emitted every frame.
 * Crops on top of plots stay dynamic (they grow), so they're NOT here.
 */
export function* iterStaticSprites(
  world: World<GameEntity>,
  season: Season = "spring",
): Generator<LogicalSprite> {
  // Backdrop: one pass over the 40×40 grid. Void tiles emit nothing.
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      const frame = backdropFrame(tx, ty, season);
      if (frame === null) continue;
      yield {
        x: tx * TILE + TILE / 2,
        y: ty * TILE + TILE / 2,
        width: TILE,
        height: TILE,
        frame,
        rotation: 0,
        layer: 0,
        alpha: 1,
      };
    }
  }

  // Shoreline foam/sand bands: on each land tile bordering ocean, facing the
  // water. Layer 1 — above the base backdrop (0), below plot dirt (2)/fences.
  for (const shore of SHORES) {
    yield {
      x: shore.tx * TILE + TILE / 2,
      y: shore.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/shore",
      rotation: shore.rotation,
      layer: 1,
      alpha: 1,
    };
  }

  // Coral reefs on open-water ocean tiles (above the animated water, below the
  // bridges/shore). Purely decorative — coral sits on non-walkable tiles and
  // never affects movement (computeCoral keeps reefs clear of shores/bridges).
  // Drawn semi-transparent (CORAL_ALPHA) so the water shows through and the
  // muted shapes read as resting deep below the surface.
  for (const coral of CORAL) {
    yield {
      x: coral.tx * TILE + TILE / 2,
      y: coral.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: coral.frame,
      rotation: coral.rotation,
      layer: 2,
      alpha: CORAL_ALPHA,
    };
  }

  // Plank bridges over the water gaps between islands (drawn above the ocean
  // backdrop + shore foam, below fences). Rotated per computeBridges.
  for (const bridge of BRIDGES) {
    yield {
      x: bridge.tx * TILE + TILE / 2,
      y: bridge.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/bridge-h",
      rotation: bridge.rotation,
      layer: 3,
      alpha: 1,
    };
  }

  // Island edges: a region-themed margin on every land tile facing ocean,
  // oriented to face the water (stone wall, wooden bulwark, or sandy beach per
  // `edgeFrame`). Above the ocean backdrop + shore foam + bridges (layers 0–3),
  // below fences (20) and entities — so it reads as the island's edge. Bridge
  // mouths stay open (road tiles get no wall).
  for (const wall of WALLS) {
    yield {
      x: wall.tx * TILE + TILE / 2,
      y: wall.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: wall.frame,
      rotation: wall.rotation,
      layer: 4,
      alpha: 1,
    };
  }

  // Farm perimeter fences (village gets none).
  for (const fence of FENCES) {
    yield {
      x: fence.tx * TILE + TILE / 2,
      y: fence.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/fence-h",
      rotation: fence.rotation,
      layer: 20,
      alpha: 1,
    };
  }

  // Big multi-tile workshop buildings (forge-house, carpenter-workshop). These
  // are large STATIC scenery anchoring the craft islands; they never move, so
  // they bake here once rather than streaming as per-tick snapshot sprites.
  // Bottom-anchored: `baseTileX`/`baseTileY` is the ground tile the building
  // stands on; the sprite extends UP and (for wide sprites) is centered over the
  // tile span. drawSprite is center-anchored, so we offset the center such that
  // the sprite's BOTTOM edge sits at the bottom of the base tile row. Layer 5
  // keeps them above the floor/walls (0–4) yet behind fences/props/NPCs (20+).
  for (const b of BIG_STRUCTURES) {
    yield {
      x: b.baseTileX * TILE + b.wPx / 2,
      y: b.baseTileY * TILE + TILE - b.hPx / 2,
      width: b.wPx,
      height: b.hPx,
      frame: b.frame,
      rotation: 0,
      layer: 5,
      alpha: 1,
    };
  }

  // Plot dirt tiles (static). The crop sprite layered on top is dynamic.
  for (const plot of world.query("plot")) {
    yield {
      x: plot.plot.tileX * TILE + TILE / 2,
      y: plot.plot.tileY * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/dirt",
      rotation: 0,
      layer: 2,
      alpha: 1,
    };
  }
}

/**
 * Large multi-tile static buildings baked into the static layer. `baseTileX` is
 * the LEFT tile column the sprite is centered-over (sprite is `wPx` wide, so a
 * 32px sprite spans `baseTileX`..`baseTileX+1`); `baseTileY` is the bottom tile
 * row the building stands on. See the bake loop in `iterStaticSprites` for the
 * bottom-anchor math. Placed on the otherwise-empty top rows of each craft
 * island so the work-yard props/NPC sit in the open ground in front.
 */
const BIG_STRUCTURES: ReadonlyArray<{
  frame: string;
  baseTileX: number;
  baseTileY: number;
  wPx: number;
  hPx: number;
}> = [
  // Blacksmith forge-house — east half of the blacksmith island (x58–67),
  // spanning tiles x63–64, standing on row y36 (rises into y34–36). Kept off the
  // x60–61 road spine (see region-setup) so the island stays traversable.
  { frame: "structure/forge-house", baseTileX: 63, baseTileY: 36, wPx: 32, hPx: 48 },
  // Carpenter's workshop — west half of the carpenter island (x20–29), spanning
  // tiles x21–22, standing on row y36 (rises into y34–36). Kept off the x24–25
  // road spine.
  { frame: "structure/carpenter-workshop", baseTileX: 21, baseTileY: 36, wPx: 32, hPx: 48 },
];

/** The forge-house chimney top, in pixel space — where smoke puffs spawn. The
 *  chimney is at recipe column ~11 of the 32px sprite, top at the sprite's top
 *  (≈ baseTileY*TILE + TILE - hPx). Used by the animated smoke overlay in main. */
export const FORGE_CHIMNEY_PX = {
  x: 63 * TILE + 11,
  y: 36 * TILE + TILE - 48 + 2,
} as const;

/** Materialize the static backdrop sprites for a one-time bake (or a season re-bake). */
export function buildStaticLayerSprites(
  world: World<GameEntity>,
  season: Season = "spring",
): Canvas2dSprite[] {
  const out: Canvas2dSprite[] = [];
  for (const ls of iterStaticSprites(world, season)) {
    out.push({
      x: ls.x,
      y: ls.y,
      width: ls.width,
      height: ls.height,
      frame: ls.frame,
      atlasId: frameToAtlasId(ls.frame),
      rotation: ls.rotation,
      layer: ls.layer,
      alpha: ls.alpha,
    });
  }
  return out;
}

// Maps each farmer action kind to the atlas pose suffix to use while performing it.
// Actions not in this map fall back to the normal walk/idle animation.
const ACTION_POSE: Record<string, string> = {
  till:          "/till",
  water:         "/water",
  "refill-can":  "/refill",
  "chop-tree":   "/chop",
  "mine-stone":  "/mine",
  plant:         "/plant",
  harvest:       "/work",   // harvest has no dedicated pose — use generic work
};

/**
 * Pick the final atlas frame for a snapshot sprite, applying:
 *  - a distinct action pose when the farmer is performing a physical action
 *  - idle bob offset (returned separately as `bobY`) when standing still
 *
 * The base frame carried on the sprite is stripped of any trailing walk suffix
 * before the action pose suffix is appended, so mid-walk action events resolve
 * cleanly to the correct personality frame (e.g. `farmer/hoarder/till`).
 */
/**
 * brief 45 — seasonal foliage remap for static feature trees (render-only).
 * The sim spawns farm/orchard trees with `structure/tree`; in autumn/winter we
 * swap the displayed frame to the season variant so the world reads as the same
 * trees changing through the year. Other frames pass through unchanged.
 */
function seasonalTreeFrame(frame: string, season: Season): string {
  if (frame !== "structure/tree") return frame;
  if (season === "autumn") return "structure/tree-autumn";
  if (season === "winter") return "structure/tree-bare";
  return frame; // spring/summer keep the green tree
}

function resolveFrameAndBob(
  s: import("./worker/snapshot").SnapshotSprite,
  nowMs: number,
  season: Season = "spring",
): { frame: string; bobY: number } {
  // Seasonal feature-tree remap (applies before any pose/walk logic; trees are
  // id-less static features so they hit the early `s.id === null` return below).
  const seasonal = seasonalTreeFrame(s.frame, season);
  if (seasonal !== s.frame) return { frame: seasonal, bobY: 0 };
  // Fishing spots: animate the three rising bubbles by cycling A→B→C (~1.2 s),
  // with a per-tile phase offset (off the pixel position) so neighbouring spots
  // don't bubble in lockstep. Wall-clock driven (nowMs) — purely cosmetic; the
  // spot's tile position still comes from the seeded BubbleSystem snapshot.
  if (s.frame === "structure/fishing-spot") {
    const SPOT_PERIOD_MS = 1200;
    const step = nowMs / (SPOT_PERIOD_MS / FISHING_SPOT_FRAMES.length);
    const phase = Math.floor(s.x / TILE) * 2 + Math.floor(s.y / TILE) * 3;
    const frame = FISHING_SPOT_FRAMES[(Math.floor(step) + phase) % FISHING_SPOT_FRAMES.length]!;
    return { frame, bobY: 0 };
  }
  if (s.id === null) return { frame: s.frame, bobY: 0 };

  // NPC pose frames (e.g. "npc/blacksmith/hammer-a") are already fully resolved
  // worker-side, as is the NPC's non-directional idle (the structure sprite).
  if (s.frame.startsWith("npc/") || !s.frame.startsWith("farmer/")) {
    return { frame: s.frame, bobY: 0 };
  }

  // Split the worker-sent farmer frame into its base personality frame and a
  // walking flag (the worker appends /walk-a|b while traveling).
  const walkMatch = /\/walk-[ab]$/.exec(s.frame);
  const isWalking = walkMatch !== null;
  const walkSuffix = walkMatch ? walkMatch[0] : "";
  const base = s.frame.replace(/\/walk-[ab]$/, ""); // e.g. "farmer/hoarder"

  // Action pose takes priority and is authored front-facing only (brief, OK).
  if (s.action !== null && s.action in ACTION_POSE) {
    return { frame: base + ACTION_POSE[s.action], bobY: 0 };
  }

  // Apply 3-way facing. "down" is the base frame (no facing segment); "up"/
  // "side" insert a facing segment before any walk suffix.
  const facing = s.facing ?? "down";
  const dirSeg = facing === "down" ? "" : `/${facing}`;
  const frame = base + dirSeg + walkSuffix;

  // Idle bob: 1.5px vertical sine oscillation (each farmer offset by id).
  const bobY = isWalking ? 0 : Math.sin(nowMs / 600 + (s.id ?? 0) * 1.3) * 1.5;
  return { frame, bobY };
}

/**
 * Push snapshot sprites (dynamic layer from the sim worker) into the renderer.
 * Each SnapshotSprite is already in pixel space and has alpha pre-computed.
 * Width/height default to TILE (16) for all snapshot sprites.
 *
 * This also draws:
 *  - MEET bubble (indicator/meet) sprites above each active meet farmer.
 *  - INTENTION bubble (indicator/intention-*) above each AI farmer for the
 *    brief window after an intention change. If a meet bubble and an intention
 *    bubble would both appear for the same farmer, the meet bubble takes
 *    priority (higher signal moment) and the intention bubble is suppressed.
 *    Brief 40.
 */
export function pushSnapshotSprites(
  renderer: Canvas2dRenderer,
  sprites: import("./worker/snapshot").SnapshotSprite[],
  meets: import("./worker/snapshot").SnapshotMeet[],
  farmerPositions: Map<number, { x: number; y: number }>,
  nowMs: number = 0,
  season: Season = "spring",
): void {
  // Build a Set of farmer ids that have an active meet bubble, so intention
  // bubbles can be suppressed for those farmers. Brief 40.
  const meetFarmerIds = new Set<number>(meets.map((m) => m.farmerId));

  // Sprites + ground drop-shadows for characters (sprites with an entity id).
  for (const s of sprites) {
    const { frame, bobY } = resolveFrameAndBob(s, nowMs, season);
    // Shadow: small ellipse at feet (bottom edge of sprite), drawn under all sprites.
    if (s.id !== null) {
      renderer.pushShadow(s.x, s.y + TILE * 0.35, TILE * 0.32, TILE * 0.12, 0.45);
    }
    renderer.push({
      x: s.x,
      y: s.y + bobY,
      width: TILE,
      height: TILE,
      frame,
      atlasId: frameToAtlasId(frame),
      rotation: s.rotation,
      layer: s.layer,
      alpha: s.alpha,
      flipX: s.flipX ?? false,
    });

    // Brief 40 — intention bubble. Only for AI farmers that have a bubble glyph
    // set AND are not currently showing a meet bubble (meet takes priority).
    if (
      s.bubble !== null &&
      s.bubble !== undefined &&
      s.id !== null &&
      !meetFarmerIds.has(s.id)
    ) {
      renderer.push({
        x: s.x,
        y: s.y - TILE,
        width: TILE,
        height: TILE,
        frame: s.bubble,
        atlasId: "items-ui",
        rotation: 0,
        layer: 89, // just below meet bubble (90) so meet always wins visually
        alpha: 1,
      });
    }
  }

  // Meet bubbles (one tile above farmer)
  for (const meet of meets) {
    const pos = farmerPositions.get(meet.farmerId);
    if (!pos) continue;
    renderer.push({
      x: pos.x,
      y: pos.y - TILE,
      width: TILE,
      height: TILE,
      frame: "indicator/meet",
      atlasId: "items-ui",
      rotation: 0,
      layer: 90,
      alpha: 1,
    });
  }
}
