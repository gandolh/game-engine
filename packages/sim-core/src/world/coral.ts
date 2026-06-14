import type { PathfinderGrid } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT, getRegion, onWorldSwap } from "./regions";
import { openPortLanes } from "./ports";

export interface CoralReef {
  id: "reef-mill" | "reef-forest";
  dock: { x: number; y: number };
  reef: { x: number; y: number };
  lane: ReadonlyArray<{ x: number; y: number }>;
}

/**
 * Coral reefs sit off the GENERATED fishing-isle positions (brief 93), so they
 * are derived lazily and rebuilt when setActiveWorld swaps the world (via
 * invalidateCoralCache). The reef hangs off the isle's south edge.
 */
let _reefs: readonly CoralReef[] | undefined;
let _reefTiles: ReadonlySet<string> | undefined;
let _dockTiles: ReadonlySet<string> | undefined;

export function invalidateCoralCache(): void {
  _reefs = undefined;
  _reefTiles = undefined;
  _dockTiles = undefined;
}

// Rebuild reefs from the new isle positions whenever the world is swapped.
onWorldSwap(invalidateCoralCache);

function reefOffIsle(id: CoralReef["id"], isleId: "fishing-isle" | "fishing-isle-2"): CoralReef {
  const b = getRegion(isleId).bounds;
  const x = Math.min(b.maxX, b.minX + 3);
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

export function coralReefs(): readonly CoralReef[] {
  if (!_reefs) {
    _reefs = [
      reefOffIsle("reef-mill", "fishing-isle"),
      reefOffIsle("reef-forest", "fishing-isle-2"),
    ];
  }
  return _reefs;
}

/** @deprecated prefer coralReefs() — live-binding getter for legacy importers. */
export const CORAL_REEFS: readonly CoralReef[] = new Proxy([] as CoralReef[], {
  get(_t, prop) {
    return Reflect.get(coralReefs() as CoralReef[], prop);
  },
}) as readonly CoralReef[];

function reefTiles(): ReadonlySet<string> {
  if (!_reefTiles) _reefTiles = new Set(coralReefs().map((r) => `${r.reef.x},${r.reef.y}`));
  return _reefTiles;
}

function dockTiles(): ReadonlySet<string> {
  if (!_dockTiles) _dockTiles = new Set(coralReefs().map((r) => `${r.dock.x},${r.dock.y}`));
  return _dockTiles;
}

export function isCoralReefTile(x: number, y: number): boolean {
  return reefTiles().has(`${Math.round(x)},${Math.round(y)}`);
}

export function isDockTile(x: number, y: number): boolean {
  return dockTiles().has(`${Math.round(x)},${Math.round(y)}`);
}

export function nearestReef(x: number, y: number): CoralReef {
  const rs = coralReefs();
  let best = rs[0]!;
  let bestD = Infinity;
  for (const r of rs) {
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
  for (const r of coralReefs()) {
    open(r.dock.x, r.dock.y);
    for (const l of r.lane) open(l.x, l.y);
    open(r.reef.x, r.reef.y);
  }
  openPortLanes(cells);
  return { cells, width: WORLD_WIDTH, height: WORLD_HEIGHT };
}
