/**
 * brief 48 — Boats & coral fishing geography + the boat-travel grid.
 *
 * The ocean is normally non-walkable (every non-region, non-road tile is water;
 * see walkable-grid.ts). Coral reefs sit OUT in that open water, reachable only
 * by boat. We keep the engine pathfinder + the land walkable grid completely
 * untouched: instead we build a SECOND PathfinderGrid (`buildBoatGrid`) whose
 * only walkable cells are the boat lanes — the dock tiles plus the straight
 * water corridors out to each reef. TravelSystem pathfinds on the LAND grid
 * normally and on the BOAT grid only while a farmer is aboard their boat. So:
 *   • coral reefs are NOT regions → the land reachability/2065-count tests are
 *     untouched;
 *   • water stays blocked for everyone on foot;
 *   • boat travel is just another deterministic pathfind, on a different grid.
 *
 * Geography (south of the central cluster's fishing isles, in the 160×160 map):
 *
 *   fishing-isle   (75–82 × 105–112): dock (78,112) → lane (78,113)(78,114) → reef (78,115)
 *   fishing-isle-2 (59–66 × 105–112): dock (62,112) → lane (62,113)(62,114) → reef (62,115)
 *
 * The dock tile is the isle's own south-edge land tile (walkable on the land
 * grid too), so a farmer walks to the dock on foot, boards, then rows straight
 * south down the lane to the reef.
 */
import type { PathfinderGrid } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT } from "./regions";

export interface CoralReef {
  /** Stable id, used in decision-trace + feed keys. */
  id: "reef-mill" | "reef-forest";
  /** The land dock tile (on the isle's south edge) where the boat is moored. */
  dock: { x: number; y: number };
  /** The reef tile out in open water where the farmer fishes. */
  reef: { x: number; y: number };
  /** The water lane tiles connecting dock → reef (exclusive of dock + reef). */
  lane: ReadonlyArray<{ x: number; y: number }>;
}

/**
 * The two coral reefs (one off each fishing isle). Symmetric short lanes keep
 * the round trip a real-but-affordable AP/time cost a personality weighs
 * against staying home to farm.
 */
export const CORAL_REEFS: readonly CoralReef[] = [
  {
    id: "reef-mill",
    dock: { x: 78, y: 112 },
    reef: { x: 78, y: 115 },
    lane: [
      { x: 78, y: 113 },
      { x: 78, y: 114 },
    ],
  },
  {
    id: "reef-forest",
    dock: { x: 62, y: 112 },
    reef: { x: 62, y: 115 },
    lane: [
      { x: 62, y: 113 },
      { x: 62, y: 114 },
    ],
  },
];

/** All reef tiles, as a lookup set (`"x,y"`) — a farmer fishes coral when on one. */
export const CORAL_REEF_TILES: ReadonlySet<string> = new Set(
  CORAL_REEFS.map((r) => `${r.reef.x},${r.reef.y}`),
);

/** All dock tiles, as a lookup set (`"x,y"`). */
export const CORAL_DOCK_TILES: ReadonlySet<string> = new Set(
  CORAL_REEFS.map((r) => `${r.dock.x},${r.dock.y}`),
);

/** True if a tile is a coral reef tile (where coral fishing resolves). */
export function isCoralReefTile(x: number, y: number): boolean {
  return CORAL_REEF_TILES.has(`${Math.round(x)},${Math.round(y)}`);
}

/** True if a tile is a boat dock tile (where a farmer boards / disembarks). */
export function isDockTile(x: number, y: number): boolean {
  return CORAL_DOCK_TILES.has(`${Math.round(x)},${Math.round(y)}`);
}

/** The reef whose dock is nearest the given tile, by Manhattan distance.
 *  Tie-break by reef id for determinism. */
export function nearestReef(x: number, y: number): CoralReef {
  let best = CORAL_REEFS[0]!;
  let bestD = Infinity;
  for (const r of CORAL_REEFS) {
    const d = Math.abs(r.dock.x - x) + Math.abs(r.dock.y - y);
    if (d < bestD || (d === bestD && r.id < best.id)) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/**
 * Build the boat-travel grid: every cell blocked EXCEPT the dock tiles + lane
 * tiles + reef tiles of every reef. Built once at startup (the lanes are
 * static). 0 = walkable (boat may traverse), 1 = blocked. TravelSystem uses
 * this grid only while a farmer is aboard.
 */
export function buildBoatGrid(): PathfinderGrid {
  const cells = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  cells.fill(1);
  const open = (x: number, y: number) => {
    cells[y * WORLD_WIDTH + x] = 0;
  };
  for (const r of CORAL_REEFS) {
    open(r.dock.x, r.dock.y);
    for (const l of r.lane) open(l.x, l.y);
    open(r.reef.x, r.reef.y);
  }
  return { cells, width: WORLD_WIDTH, height: WORLD_HEIGHT };
}
