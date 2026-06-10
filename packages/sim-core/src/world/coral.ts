// Coral reef geography: water lanes south of the fishing isles, reachable only by boat.
// TravelSystem pathfinds on the LAND grid normally, on the BOAT grid only while aboard.
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

/** Boat grid: all blocked except dock + lane + reef tiles. Used by TravelSystem while aboard. */
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
