// Port-to-port boat network. Generalises the coral dock→reef stubs (coral.ts) into
// a connected lane network over open ocean: a farmer walks (on foot) to a port's
// dock — a LAND tile on the island edge — boards, the boat travels fixed water
// lanes to another port's dock, then disembarks back onto land.
//
// Lanes are NARROW FIXED CORRIDORS (never open-water traversal) so JS/WASM
// pathfinder parity stays clean (see project_pathfinder_js_wasm_diverge).
//
// Geometry. The grown world's bridge columns slice every ocean channel top-to-
// bottom, so a 4-spoke hub can't be carved without crossing bridges. The one
// reachable open channel is the SOUTH-CENTRAL column (x≈100..113, "channel B"):
// a vertical ocean trunk at TRUNK_X with short spurs to three island docks.
// Docks are DERIVED from each live island's edge (mirrors coral's reefOffIsle) so
// the network tracks the parametric world scale; a module-load assertion fails
// loudly if any lane tile is not ocean (geometry drift). The boat grid opens both
// the dock LAND tiles and the ocean lanes so a boarded farmer can step off the
// island onto the first lane tile.
import type { PathfinderGrid } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT, getRegion, type RegionId } from "./regions";
import { buildWalkableGrid } from "./walkable-grid";

export interface Port {
  /** Stable id, used in decision-trace + render + feed keys. */
  id: "port-fishing-isle" | "port-fishing-isle-2" | "port-casino";
  /** The island this port sits on. */
  isle: RegionId;
  /** Land tile on the island edge where a farmer boards / disembarks (walkable on foot). */
  dock: { x: number; y: number };
  /** Ocean lane tiles from the dock to the shared trunk (exclusive of dock). */
  lane: ReadonlyArray<{ x: number; y: number }>;
}

/** The shared vertical trunk lane (open south-central ocean channel). */
const TRUNK_X = 105;
/** The row the side spurs and the trunk core share. */
const JOIN_Y = 162;
/** Trunk core span (the join row down to the casino spur's bottom). */
const TRUNK_Y0 = 162;
const TRUNK_Y1 = 173;

type Vec = { x: number; y: number };

/** Axis-aligned run between two collinear points (start excluded, end included). */
function run(from: Vec, to: Vec): Vec[] {
  const out: Vec[] = [];
  const sx = Math.sign(to.x - from.x);
  const sy = Math.sign(to.y - from.y);
  let { x, y } = from;
  while (x !== to.x || y !== to.y) {
    x += sx;
    y += sy;
    out.push({ x, y });
  }
  return out;
}

/** West/East-edge port: dock on the island's edge column (mid row), lane runs
 *  horizontally out into ocean to the trunk. */
function sidePort(id: Port["id"], isle: RegionId, side: "W" | "E"): Port {
  const b = getRegion(isle).bounds;
  const y = Math.floor((b.minY + b.maxY) / 2);
  const dock = { x: side === "W" ? b.minX : b.maxX, y };
  const first = { x: side === "W" ? b.minX - 1 : b.maxX + 1, y };
  const lane = [first, ...run(first, { x: TRUNK_X, y })];
  return { id, isle, dock, lane };
}

/** North-edge port: dock on the island's north row at `col`, lane runs up to the
 *  join row then across to the trunk. */
function northPort(id: Port["id"], isle: RegionId, col: number): Port {
  const b = getRegion(isle).bounds;
  const dock = { x: col, y: b.minY };
  const first = { x: col, y: b.minY - 1 };
  const up = run(first, { x: col, y: JOIN_Y });
  const across = run({ x: col, y: JOIN_Y }, { x: TRUNK_X, y: JOIN_Y });
  return { id, isle, dock, lane: [first, ...up, ...across] };
}

export const PORTS: readonly Port[] = [
  sidePort("port-fishing-isle", "fishing-isle", "W"),
  sidePort("port-fishing-isle-2", "fishing-isle-2", "E"),
  northPort("port-casino", "casino", 110),
];

/** All port dock tiles, as a lookup set (`"x,y"`). A farmer boards/disembarks here. */
export const PORT_DOCK_TILES: ReadonlySet<string> = new Set(
  PORTS.map((p) => `${p.dock.x},${p.dock.y}`),
);

export function isPortDockTile(x: number, y: number): boolean {
  return PORT_DOCK_TILES.has(`${Math.round(x)},${Math.round(y)}`);
}

/** The port whose dock is nearest the given tile, by Manhattan distance.
 *  Tie-break by port id for determinism. */
export function nearestPort(x: number, y: number): Port {
  let best = PORTS[0]!;
  let bestD = Infinity;
  for (const p of PORTS) {
    const d = Math.abs(p.dock.x - x) + Math.abs(p.dock.y - y);
    if (d < bestD || (d === bestD && p.id < best.id)) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** The port a farmer is standing on the dock tile of, if any. */
export function portAtDockTile(x: number, y: number): Port | undefined {
  const rx = Math.round(x);
  const ry = Math.round(y);
  return PORTS.find((p) => p.dock.x === rx && p.dock.y === ry);
}

/** Lookup set of every port OCEAN lane tile (`"x,y"`); docks excluded (those are land).
 *  Used by player-control to let an aboard Pip step along the lanes. Lazily built. */
let _portLaneSet: ReadonlySet<string> | undefined;
export function isPortLaneTile(x: number, y: number): boolean {
  if (!_portLaneSet) {
    _portLaneSet = new Set(portLaneTiles().map((t) => `${t.x},${t.y}`));
  }
  return _portLaneSet.has(`${Math.round(x)},${Math.round(y)}`);
}

/** Every OCEAN lane tile in the network (docks excluded — those are land). */
export function portLaneTiles(): Vec[] {
  const set = new Map<string, Vec>();
  const add = (v: Vec) => set.set(`${v.x},${v.y}`, v);
  add({ x: TRUNK_X, y: TRUNK_Y0 });
  for (const v of run({ x: TRUNK_X, y: TRUNK_Y0 }, { x: TRUNK_X, y: TRUNK_Y1 })) add(v);
  for (const p of PORTS) for (const v of p.lane) add(v);
  return [...set.values()];
}

/** Open the port network's tiles on a boat grid: the dock LAND tiles (so a
 *  boarded farmer can leave the island) plus the ocean lanes. Mutates `cells`. */
export function openPortLanes(cells: Uint8Array): void {
  for (const p of PORTS) cells[p.dock.y * WORLD_WIDTH + p.dock.x] = 0;
  for (const t of portLaneTiles()) cells[t.y * WORLD_WIDTH + t.x] = 0;
}

/** Boat grid for the port network alone (used by tests; the live grid unions coral + ports). */
export function buildPortGrid(): PathfinderGrid {
  const cells = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  cells.fill(1);
  openPortLanes(cells);
  return { cells, width: WORLD_WIDTH, height: WORLD_HEIGHT };
}

// Module-load guard: every OCEAN lane tile must be open ocean (blocked on the land
// grid). If world geometry drifts so a lane crosses an island/bridge, fail loudly
// at startup rather than silently routing a boat over land. (Dock tiles ARE land —
// excluded from this check by construction; portLaneTiles() omits them.)
{
  const landGrid = buildWalkableGrid();
  const offenders = portLaneTiles().filter(
    (t) => landGrid.cells[t.y * WORLD_WIDTH + t.x] === 0,
  );
  if (offenders.length > 0) {
    throw new Error(
      `[ports] ${offenders.length} port-lane tile(s) overlap land/bridge — geometry drift: ` +
        offenders.map((t) => `(${t.x},${t.y})`).join(" "),
    );
  }
}
