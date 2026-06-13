

import type { PathfinderGrid } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT, getRegion, type RegionId } from "./regions";
import { buildWalkableGrid } from "./walkable-grid";

export interface Port {

  id: "port-fishing-isle" | "port-fishing-isle-2" | "port-casino";

  isle: RegionId;

  dock: { x: number; y: number };

  lane: ReadonlyArray<{ x: number; y: number }>;
}

const TRUNK_X = 105;

const JOIN_Y = 162;

const TRUNK_Y0 = 162;
const TRUNK_Y1 = 173;

type Vec = { x: number; y: number };

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

function sidePort(id: Port["id"], isle: RegionId, side: "W" | "E"): Port {
  const b = getRegion(isle).bounds;
  const y = Math.floor((b.minY + b.maxY) / 2);
  const dock = { x: side === "W" ? b.minX : b.maxX, y };
  const first = { x: side === "W" ? b.minX - 1 : b.maxX + 1, y };
  const lane = [first, ...run(first, { x: TRUNK_X, y })];
  return { id, isle, dock, lane };
}

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

export const PORT_DOCK_TILES: ReadonlySet<string> = new Set(
  PORTS.map((p) => `${p.dock.x},${p.dock.y}`),
);

export function isPortDockTile(x: number, y: number): boolean {
  return PORT_DOCK_TILES.has(`${Math.round(x)},${Math.round(y)}`);
}

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

export function portAtDockTile(x: number, y: number): Port | undefined {
  const rx = Math.round(x);
  const ry = Math.round(y);
  return PORTS.find((p) => p.dock.x === rx && p.dock.y === ry);
}

let _portLaneSet: ReadonlySet<string> | undefined;
export function isPortLaneTile(x: number, y: number): boolean {
  if (!_portLaneSet) {
    _portLaneSet = new Set(portLaneTiles().map((t) => `${t.x},${t.y}`));
  }
  return _portLaneSet.has(`${Math.round(x)},${Math.round(y)}`);
}

export function portLaneTiles(): Vec[] {
  const set = new Map<string, Vec>();
  const add = (v: Vec) => set.set(`${v.x},${v.y}`, v);
  add({ x: TRUNK_X, y: TRUNK_Y0 });
  for (const v of run({ x: TRUNK_X, y: TRUNK_Y0 }, { x: TRUNK_X, y: TRUNK_Y1 })) add(v);
  for (const p of PORTS) for (const v of p.lane) add(v);
  return [...set.values()];
}

export function openPortLanes(cells: Uint8Array): void {
  for (const p of PORTS) cells[p.dock.y * WORLD_WIDTH + p.dock.x] = 0;
  for (const t of portLaneTiles()) cells[t.y * WORLD_WIDTH + t.x] = 0;
}

export function buildPortGrid(): PathfinderGrid {
  const cells = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  cells.fill(1);
  openPortLanes(cells);
  return { cells, width: WORLD_WIDTH, height: WORLD_HEIGHT };
}

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
