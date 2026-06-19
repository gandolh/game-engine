

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
import { PORTS } from "../world/ports";

const TILE = 16;
const QUARTER_TURN = Math.PI / 2;

export interface InteriorDecorTile {
  tx: number;
  ty: number;
  frame: string;
  rotation: number;
}

export const INTERIOR_DECOR_ALPHA = 1;

export const MIN_SPACING = 2;

const MAX_ATTEMPTS = 600;

interface ThemeEntry {

  frames: readonly string[];

  density: number;
}

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

  camp: {
    frames: ["decoration/log-stack", "decoration/barrel", "decoration/crate", "decoration/hay-bale"],
    density: 5,
  },

  pond: {
    frames: ["decoration/cattail"],
    density: 4,
  },

  volcano: {
    frames: ["decoration/rubble", "decoration/ore-cart", "decoration/crate"],
    density: 6,
  },

  ranch: {
    frames: ["decoration/hay-bale", "decoration/barrel", "decoration/grain-sack"],
    density: 5,
  },
  "big-tree": {
    frames: ["decoration/fern", "decoration/bush", "decoration/mushroom-cluster"],
    density: 6,
  },

  boxing: {
    frames: ["decoration/crowd-stand", "decoration/barrel", "decoration/crate", "decoration/lamp-post"],
    density: 6,
  },
};

const key = (x: number, y: number): number => y * WORLD_WIDTH + x;

const inWorld = (x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT;

const toTile = (px: number): number => Math.floor(px / TILE);

function nearBridge(tx: number, ty: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (BRIDGE_SET.has(key(tx + dx, ty + dy))) return true;
    }
  }
  return false;
}

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
  for (const p of PORTS) {
    forbidden.add(key(p.dock.x, p.dock.y));
  }

  return forbidden;
}

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

      forbidden.add(k);
    }
  }

  return placed;
}

function countInRegion(placed: readonly InteriorDecorTile[], id: RegionId): number {
  let n = 0;
  for (const p of placed) if (regionAt(p.tx, p.ty) === id) n++;
  return n;
}
