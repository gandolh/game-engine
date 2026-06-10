/**
 * render-systems/static-layer.ts — static backdrop baking.
 *
 * `iterStaticSprites` enumerates all never-changing tiles; `buildStaticLayerSprites`
 * materialises them into Canvas2dSprite objects for a one-time (or season-rebake).
 */

import type { World } from "@engine/core";
import type { Canvas2dSprite } from "@engine/core";
import type { GameEntity } from "../components";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TOWN_SQUARE,
  regionAt,
  isWalkable,
} from "../world/regions";
import type { Season } from "../protocols/weather";
import {
  FENCES,
  WALLS,
  SHORES,
  BRIDGES,
  CORAL,
  CLIFFS,
  BIG_STRUCTURES,
  BRIDGE_SET,
  CORAL_ALPHA,
  FISHING_STATICS,
} from "./geometry";
import { SET_PIECES, SET_PIECE_ALPHA } from "./set-pieces";
import { frameToAtlasId } from "./frames";

const TILE = 16;

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
 * Decide which background frame (if any) a tile gets.
 * - void (non-walkable) → null
 * - road only (no region) → "tile/path"
 * - farm-* → "tile/grass"
 * - village inner square (TOWN_SQUARE) → "tile/market-floor" (decorative stone)
 * - village outer → "tile/dirt"
 * - blacksmith → "tile/forge-floor" (dark stone with heat cracks)
 * - carpentry → "tile/carpentry-floor" (laid stone-slab flooring)
 * - resource-zone → "tile/grass" (same as farms — they're green areas)
 * - shrine → "tile/shrine-floor"; harbor → "tile/dock-floor";
 *   heritage-* → "tile/heritage-floor"; waterfall/camp → seasonal grass
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
  // Landmark / service islands get their own ground so they don't all read as
  // bland dirt (richer "peisage"): shrine flagstone, harbor planking, mossy
  // heritage stone, grassy waterfall + campsite.
  if (region === "shrine") return "tile/shrine-floor";
  if (region === "harbor") return "tile/dock-floor";
  if (region === "heritage-stones" || region === "heritage-ruin" || region === "heritage-statue") {
    return "tile/heritage-floor";
  }
  if (region === "waterfall") return grassFrame; // mossy green base under the cliff
  if (region === "camp") return grassFrame;       // campsite on grass
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

  // Decorative open-water props (brief 49): lone rocks + sandbar patches
  // scattered out in the open ocean as seabed accents. Same layer/treatment as
  // the coral — drawn semi-transparent (SET_PIECE_ALPHA) so they read as resting
  // deep below the surface. Purely visual: set-pieces sit on non-walkable open
  // water (kept clear of shores, coral, reefs, docks, and boat lanes by
  // computeSetPieces) and never affect movement or sim.
  for (const piece of SET_PIECES) {
    yield {
      x: piece.tx * TILE + TILE / 2,
      y: piece.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: piece.frame,
      rotation: piece.rotation,
      layer: 2,
      alpha: SET_PIECE_ALPHA,
    };
  }

  // Cliff-face skirts (brief 65): vertical stone faces on the ocean tiles south
  // of tall islands, making them read as elevated. Layer 2 — same as coral, above
  // the animated water backdrop (0) and shore foam (1), below bridges (3) and
  // island walls (4). Full opacity so the stone face reads clearly; the wall and
  // shore above (layers 1 and 4) sit on the land tile; the cliff sits on the ocean
  // tile directly below, extending the visual height down to the waterline.
  for (const cliff of CLIFFS) {
    yield {
      x: cliff.tx * TILE + TILE / 2,
      y: cliff.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: cliff.frame,
      rotation: 0,
      layer: 2,
      alpha: 1,
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

  // brief 48 — Boats & Coral Fishing static decorations. A moored boat at each
  // dock tile (layer 6 — above the floor/walls and big-structure buildings, so
  // the boat reads as sitting on the dock rather than behind it) and a reef
  // marker at each reef tile (layer 2 — same as the decorative coral, so it
  // appears submerged but still clearly visible at full opacity).
  for (const fs of FISHING_STATICS) {
    const isBoat = fs.frame === "structure/boat";
    yield {
      x: fs.tx * TILE + TILE / 2,
      y: fs.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: fs.frame,
      rotation: 0,
      layer: isBoat ? 6 : 2,
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

