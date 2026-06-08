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
 * Geography (south edge of the 88×80 archipelago, below the two fishing isles):
 *
 *   fishing-isle   (40–47 × 68–75): dock (43,75) → lane (43,76)(43,77) → reef (43,78)
 *   fishing-isle-2 (22–29 × 68–75): dock (25,75) → lane (25,76)(25,77) → reef (25,78)
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
    dock: { x: 43, y: 75 },
    reef: { x: 43, y: 78 },
    lane: [
      { x: 43, y: 76 },
      { x: 43, y: 77 },
    ],
  },
  {
    id: "reef-forest",
    dock: { x: 25, y: 75 },
    reef: { x: 25, y: 78 },
    lane: [
      { x: 25, y: 76 },
      { x: 25, y: 77 },
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
