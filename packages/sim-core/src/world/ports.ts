import type { PathfinderGrid } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT, getRegion, onWorldSwap, type RegionId } from "./regions";
import { buildWalkableGrid } from "./walkable-grid";

export interface Port {
  id: "port-fishing-isle" | "port-fishing-isle-2" | "port-casino";
  isle: RegionId;
  dock: { x: number; y: number };
  lane: ReadonlyArray<{ x: number; y: number }>;
}

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

/**
 * Ports are derived from the GENERATED isle/casino positions (brief 93), so they
 * are computed lazily on first use and rebuilt when setActiveWorld swaps the
 * world (via invalidatePortsCache). The trunk that ports join is derived from
 * the casino dock so the lane network rides with the generated layout.
 */
let _ports: readonly Port[] | undefined;
let _portLaneSet: ReadonlySet<string> | undefined;
let _trunk: { x: number; y0: number; y1: number } | undefined;

export function invalidatePortsCache(): void {
  _ports = undefined;
  _portLaneSet = undefined;
  _trunk = undefined;
}

// Rebuild ports from the new isle positions whenever the world is swapped.
onWorldSwap(invalidatePortsCache);

/** Lane trunk column + extent: a short vertical seam south of the casino dock. */
function trunk(): { x: number; y0: number; y1: number } {
  if (_trunk) return _trunk;
  const casino = getRegion("casino").bounds;
  const x = Math.floor((casino.minX + casino.maxX) / 2);
  // Join row sits a few tiles south of the southernmost port isle.
  const isles = ["fishing-isle", "fishing-isle-2", "casino"] as const;
  let maxY = 0;
  for (const id of isles) maxY = Math.max(maxY, getRegion(id).bounds.maxY);
  const y0 = Math.min(WORLD_HEIGHT - 2, maxY + 6);
  _trunk = { x, y0, y1: Math.min(WORLD_HEIGHT - 1, y0 + 11) };
  return _trunk;
}

function sidePort(id: Port["id"], isle: RegionId, side: "W" | "E"): Port {
  const b = getRegion(isle).bounds;
  const y = Math.floor((b.minY + b.maxY) / 2);
  const dock = { x: side === "W" ? b.minX : b.maxX, y };
  const first = { x: side === "W" ? b.minX - 1 : b.maxX + 1, y };
  const t = trunk();
  const lane = [first, ...run(first, { x: t.x, y })];
  return { id, isle, dock, lane };
}

function northPort(id: Port["id"], isle: RegionId): Port {
  const b = getRegion(isle).bounds;
  const col = Math.floor((b.minX + b.maxX) / 2);
  const t = trunk();
  const dock = { x: col, y: b.maxY };
  const first = { x: col, y: b.maxY + 1 };
  const down = run(first, { x: col, y: t.y0 });
  const across = run({ x: col, y: t.y0 }, { x: t.x, y: t.y0 });
  return { id, isle, dock, lane: [first, ...down, ...across] };
}

function buildPorts(): readonly Port[] {
  return [
    sidePort("port-fishing-isle", "fishing-isle", "W"),
    sidePort("port-fishing-isle-2", "fishing-isle-2", "E"),
    northPort("port-casino", "casino"),
  ];
}

export function ports(): readonly Port[] {
  if (!_ports) _ports = buildPorts();
  return _ports;
}

/** @deprecated prefer ports() — kept as a live-binding getter for legacy importers. */
export const PORTS: readonly Port[] = new Proxy([] as Port[], {
  get(_t, prop) {
    return Reflect.get(ports() as Port[], prop);
  },
}) as readonly Port[];

export function isPortDockTile(x: number, y: number): boolean {
  const rx = Math.round(x);
  const ry = Math.round(y);
  return ports().some((p) => p.dock.x === rx && p.dock.y === ry);
}

export function nearestPort(x: number, y: number): Port {
  const ps = ports();
  let best = ps[0]!;
  let bestD = Infinity;
  for (const p of ps) {
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
  return ports().find((p) => p.dock.x === rx && p.dock.y === ry);
}

export function isPortLaneTile(x: number, y: number): boolean {
  if (!_portLaneSet) {
    _portLaneSet = new Set(portLaneTiles().map((t) => `${t.x},${t.y}`));
  }
  return _portLaneSet.has(`${Math.round(x)},${Math.round(y)}`);
}

export function portLaneTiles(): Vec[] {
  const set = new Map<string, Vec>();
  const add = (v: Vec) => set.set(`${v.x},${v.y}`, v);
  const t = trunk();
  add({ x: t.x, y: t.y0 });
  for (const v of run({ x: t.x, y: t.y0 }, { x: t.x, y: t.y1 })) add(v);
  for (const p of ports()) for (const v of p.lane) add(v);
  return [...set.values()];
}

export function openPortLanes(cells: Uint8Array): void {
  for (const p of ports()) cells[p.dock.y * WORLD_WIDTH + p.dock.x] = 0;
  for (const t of portLaneTiles()) cells[t.y * WORLD_WIDTH + t.x] = 0;
}

export function buildPortGrid(): PathfinderGrid {
  const cells = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  cells.fill(1);
  openPortLanes(cells);
  return { cells, width: WORLD_WIDTH, height: WORLD_HEIGHT };
}

/**
 * Asserts no port-lane tile overlaps land/bridge for the ACTIVE world. Called by
 * bootstrap after setActiveWorld (no longer a module-load side effect, since the
 * world now varies per seed). Returns the offending tiles (empty = clean).
 */
export function assertPortLanesClear(): void {
  const landGrid = buildWalkableGrid();
  const offenders = portLaneTiles().filter(
    (t) => landGrid.cells[t.y * WORLD_WIDTH + t.x] === 0,
  );
  if (offenders.length > 0) {
    throw new Error(
      `[ports] ${offenders.length} port-lane tile(s) overlap land/bridge: ` +
        offenders.map((t) => `(${t.x},${t.y})`).join(" "),
    );
  }
}
