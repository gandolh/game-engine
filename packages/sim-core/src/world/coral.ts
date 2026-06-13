

import type { PathfinderGrid } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT, getRegion } from "./regions";
import { openPortLanes } from "./ports";

export interface CoralReef {

  id: "reef-mill" | "reef-forest";

  dock: { x: number; y: number };

  reef: { x: number; y: number };

  lane: ReadonlyArray<{ x: number; y: number }>;
}

function reefOffIsle(id: CoralReef["id"], isleId: "fishing-isle" | "fishing-isle-2"): CoralReef {
  const b = getRegion(isleId).bounds;
  const x = b.minX + 3;
  const dockY = b.maxY;
  return {
    id,
    dock: { x, y: dockY },
    lane: [
      { x, y: dockY + 1 },
      { x, y: dockY + 2 },
    ],
    reef: { x, y: dockY + 3 },
  };
}

export const CORAL_REEFS: readonly CoralReef[] = [
  reefOffIsle("reef-mill", "fishing-isle"),
  reefOffIsle("reef-forest", "fishing-isle-2"),
];

export const CORAL_REEF_TILES: ReadonlySet<string> = new Set(
  CORAL_REEFS.map((r) => `${r.reef.x},${r.reef.y}`),
);

export const CORAL_DOCK_TILES: ReadonlySet<string> = new Set(
  CORAL_REEFS.map((r) => `${r.dock.x},${r.dock.y}`),
);

export function isCoralReefTile(x: number, y: number): boolean {
  return CORAL_REEF_TILES.has(`${Math.round(x)},${Math.round(y)}`);
}

export function isDockTile(x: number, y: number): boolean {
  return CORAL_DOCK_TILES.has(`${Math.round(x)},${Math.round(y)}`);
}

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
  openPortLanes(cells);
  return { cells, width: WORLD_WIDTH, height: WORLD_HEIGHT };
}
