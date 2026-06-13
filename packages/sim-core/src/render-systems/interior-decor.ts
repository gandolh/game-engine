// RENDER-ONLY themed interior décor scatter. Mirrors the open-water set-pieces idiom
// (rejection-sampled blue-noise, Chebyshev min-spacing, seeded off WORLD_GEN_SEED) but
// INVERTS the eligibility test: props must land on walkable region-interior tiles.
//
// STRICTLY RENDER-ONLY: `RegionDef.theme` and these décor tiles are NEVER read by sim
// logic. They exist purely to dress themed islands with props for the feeling of the game.
import { createRng } from "@engine/core";
import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  REGIONS,
  regionAt,
  isWalkable,
  WORLD_GEN_SEED,
  HARBOR_DOCK_TILE,
  HARBOR_BOARD_TILE,
  type RegionId,
  type RegionTheme,
} from "../world/regions";
import { BRIDGE_SET } from "./geometry";
import { CORAL_REEFS } from "../world/coral";

const TILE = 16;
const QUARTER_TURN = Math.PI / 2;

/** A single decorative interior prop (frame at a tile coordinate). */
export interface InteriorDecorTile {
  tx: number;
  ty: number;
  frame: string;
  rotation: number;
}

/** Opaque interior props (unlike the 0.45 semi-transparent seabed set-pieces). */
export const INTERIOR_DECOR_ALPHA = 1;

/** Chebyshev min-distance between any two interior props (blue-noise scatter). */
export const MIN_SPACING = 2;

/** Max rejection-sample attempts per region before giving up. */
const MAX_ATTEMPTS = 600;

interface ThemeEntry {
  /** Atlas frame ids to pick from (props sheet). */
  frames: readonly string[];
  /** Target props per 100 walkable region tiles. */
  density: number;
}

/** Central per-theme décor table. Frames are existing `decoration/*` atlas ids only. */
export const THEME_TABLE: Record<RegionTheme, ThemeEntry> = {
  forest: {
    frames: ["decoration/fern", "decoration/bush", "decoration/log-stack", "decoration/mushroom-cluster"],
    density: 6,
  },
  quarry: {
    frames: ["decoration/ore-cart", "decoration/rubble", "decoration/crate"],
    density: 6,
  },
  heritage: {
    frames: ["decoration/cairn", "decoration/stone-lantern", "decoration/rubble"],
    density: 5,
  },
  shrine: {
    frames: ["decoration/stone-lantern", "decoration/torii", "decoration/lamp-post"],
    density: 5,
  },
  casino: {
    frames: ["decoration/lamp-post", "decoration/potted-plant", "decoration/barrel"],
    density: 6,
  },
  ring: {
    frames: ["decoration/hay-bale", "decoration/grain-sack", "decoration/flour-bag", "decoration/barrel", "decoration/crate"],
    density: 4,
  },
  // Campsite clutter (camp island).
  camp: {
    frames: ["decoration/log-stack", "decoration/barrel", "decoration/crate", "decoration/hay-bale"],
    density: 5,
  },
  // Pond reeds (ice-pond — sparse, no snowy frames available).
  pond: {
    frames: ["decoration/cattail"],
    density: 4,
  },
  // Volcanic rubble (volcano islet).
  volcano: {
    frames: ["decoration/rubble", "decoration/ore-cart", "decoration/crate"],
    density: 6,
  },
  // Used by later décor todos (per-farm ranch islands, big-tree island).
  ranch: {
    frames: ["decoration/hay-bale", "decoration/barrel", "decoration/grain-sack"],
    density: 5,
  },
  "big-tree": {
    frames: ["decoration/fern", "decoration/bush", "decoration/mushroom-cluster"],
    density: 6,
  },
  // Boxing-ring landmark (ring island). The ring posts + ropes are a deliberate baked
  // BIG_STRUCTURES layout (geometry.ts); this theme only scatters crowd-stand spectators
  // and a little ringside clutter around the ring.
  boxing: {
    frames: ["decoration/crowd-stand", "decoration/barrel", "decoration/crate", "decoration/lamp-post"],
    density: 6,
  },
};

const key = (x: number, y: number): number => y * WORLD_WIDTH + x;

const inWorld = (x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT;

/** Pixel-space transform → tile coordinate (transform stores the tile center). */
const toTile = (px: number): number => Math.floor(px / TILE);

/** True if (tx,ty) itself or any of its 8 neighbours is a bridge/road tile. */
function nearBridge(tx: number, ty: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (BRIDGE_SET.has(key(tx + dx, ty + dy))) return true;
    }
  }
  return false;
}

/**
 * Build the forbidden-tile set: the union of every functional anchor décor must dodge —
 * plots, solids, NPC stations, home/fountain transforms, dock/board tiles, coral docks,
 * and any decoration/structure sprite already placed in the world (so we never double-draw).
 */
function buildForbidden(world: World<GameEntity>): Set<number> {
  const forbidden = new Set<number>();

  for (const e of world.query("plot")) {
    forbidden.add(key(e.plot.tileX, e.plot.tileY));
  }
  for (const e of world.query("solid")) {
    forbidden.add(key(e.solid.tileX, e.solid.tileY));
  }
  for (const e of world.query("workNpc")) {
    for (const st of e.workNpc.stations) forbidden.add(key(st.tileX, st.tileY));
  }
  for (const e of world.query("home")) {
    if (e.transform) forbidden.add(key(toTile(e.transform.x), toTile(e.transform.y)));
  }
  for (const e of world.query("fountain")) {
    if (e.transform) forbidden.add(key(toTile(e.transform.x), toTile(e.transform.y)));
  }
  // Any decoration/structure sprite already placed (e.g. trees, buildings, farm décor).
  for (const e of world.query("sprite")) {
    const frame = e.sprite.frame;
    if (!frame.startsWith("decoration/") && !frame.startsWith("structure/")) continue;
    if (!e.transform) continue;
    forbidden.add(key(toTile(e.transform.x), toTile(e.transform.y)));
  }

  forbidden.add(key(HARBOR_DOCK_TILE.x, HARBOR_DOCK_TILE.y));
  forbidden.add(key(HARBOR_BOARD_TILE.x, HARBOR_BOARD_TILE.y));
  for (const reef of CORAL_REEFS) {
    forbidden.add(key(reef.dock.x, reef.dock.y));
  }

  return forbidden;
}

/**
 * Compute the render-only interior décor scatter for every themed region.
 * Deterministic: each region forks `createRng(WORLD_GEN_SEED).fork('decor:'+id)` and draws
 * ALL rng fields every iteration regardless of acceptance, keeping the stream aligned.
 */
export function computeInteriorDecor(world: World<GameEntity>): readonly InteriorDecorTile[] {
  const forbidden = buildForbidden(world);
  const placed: InteriorDecorTile[] = [];
  const placedKeys = new Set<number>();

  const farEnough = (tx: number, ty: number): boolean => {
    for (const p of placed) {
      const cheby = Math.max(Math.abs(p.tx - tx), Math.abs(p.ty - ty));
      if (cheby < MIN_SPACING) return false;
    }
    return true;
  };

  for (const region of REGIONS) {
    const theme = region.theme;
    if (theme === undefined) continue;
    const entry = THEME_TABLE[theme];

    // Walkable interior tile count of this region (for the density-scaled target).
    const { minX, minY, maxX, maxY } = region.bounds;
    let walkableCount = 0;
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (regionAt(tx, ty) === region.id && isWalkable(tx, ty)) walkableCount++;
      }
    }
    const target = Math.max(1, Math.round((walkableCount * entry.density) / 100));

    const rng = createRng(WORLD_GEN_SEED).fork("decor:" + region.id);

    for (let attempt = 0; attempt < MAX_ATTEMPTS && countInRegion(placed, region.id) < target; attempt++) {
      // Draw all four rng fields every iteration to keep the stream aligned regardless of acceptance.
      const tx = rng.int(minX, maxX + 1);
      const ty = rng.int(minY, maxY + 1);
      const frame = rng.pick(entry.frames);
      const rotation = rng.int(0, 4) * QUARTER_TURN;

      const k = key(tx, ty);
      if (placedKeys.has(k)) continue;
      if (forbidden.has(k)) continue;
      if (!inWorld(tx, ty)) continue;
      if (regionAt(tx, ty) !== region.id) continue;
      if (!isWalkable(tx, ty)) continue;
      if (nearBridge(tx, ty)) continue;
      if (!farEnough(tx, ty)) continue;

      placed.push({ tx, ty, frame, rotation });
      placedKeys.add(k);
      // Forbid this tile globally so regions never overlap each other's décor.
      forbidden.add(k);
    }
  }

  return placed;
}

/** Count already-placed props inside a region (target is per-region). */
function countInRegion(placed: readonly InteriorDecorTile[], id: RegionId): number {
  let n = 0;
  for (const p of placed) if (regionAt(p.tx, p.ty) === id) n++;
  return n;
}
