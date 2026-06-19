import { WORLD_WIDTH, WORLD_HEIGHT, getRegion, regionAt, isWalkable, onWorldSwap, type RegionId } from "./regions";

export interface Port {
  id: "port-fishing-isle" | "port-fishing-isle-2" | "port-casino";
  isle: RegionId;
  dock: { x: number; y: number };
  /**
   * A short run of open-ocean tiles seaward of the dock. Boats moor on lane[0];
   * décor avoids these tiles. With the open-ocean boat grid (brief 93) lanes are
   * NOT used for navigation — boats path freely over all open water.
   */
  lane: ReadonlyArray<{ x: number; y: number }>;
}

type Vec = { x: number; y: number };

/**
 * Ports are derived from the GENERATED isle/casino positions (brief 93): the
 * dock sits on the island edge that faces the most open ocean, and the lane is a
 * short seaward stub. Computed lazily and rebuilt on world swap.
 */
let _ports: readonly Port[] | undefined;
let _portLaneSet: ReadonlySet<string> | undefined;

export function invalidatePortsCache(): void {
  _ports = undefined;
  _portLaneSet = undefined;
}
onWorldSwap(invalidatePortsCache);

type Rect = { minX: number; minY: number; maxX: number; maxY: number };

/** Counts open-ocean tiles just outside a given side of the bounds (seaward-ness). */
function oceanOnSide(b: Rect, side: "N" | "S" | "E" | "W"): number {
  let n = 0;
  if (side === "N" || side === "S") {
    const y = side === "N" ? b.minY - 1 : b.maxY + 1;
    for (let x = b.minX; x <= b.maxX; x++) if (regionAt(x, y) === null) n++;
  } else {
    const x = side === "W" ? b.minX - 1 : b.maxX + 1;
    for (let y = b.minY; y <= b.maxY; y++) if (regionAt(x, y) === null) n++;
  }
  return n;
}

/** Builds a port whose dock faces the island's most-open-ocean side. */
function portForIsle(id: Port["id"], isle: RegionId): Port {
  const b = getRegion(isle).bounds;
  const sides: Array<"N" | "S" | "E" | "W"> = ["S", "N", "E", "W"];
  let best: "N" | "S" | "E" | "W" = "S";
  let bestOpen = -1;
  for (const s of sides) {
    const o = oceanOnSide(b, s);
    if (o > bestOpen) { bestOpen = o; best = s; }
  }
  const midX = Math.floor((b.minX + b.maxX) / 2);
  const midY = Math.floor((b.minY + b.maxY) / 2);
  const outward: Vec =
    best === "N" ? { x: 0, y: -1 } :
    best === "S" ? { x: 0, y: 1 } :
    best === "E" ? { x: 1, y: 0 } : { x: -1, y: 0 };

  // Scan the chosen side for a dock: an island LAND edge tile whose seaward
  // neighbour is OPEN OCEAN. Prefer the candidate nearest the side midpoint
  // (deterministic) so the dock sits centrally where it can. This avoids putting
  // the dock on a carved corner or facing a neighbouring island.
  const edgeTiles: Vec[] = [];
  if (best === "N" || best === "S") {
    const y = best === "N" ? b.minY : b.maxY;
    for (let x = b.minX; x <= b.maxX; x++) edgeTiles.push({ x, y });
    edgeTiles.sort((a, c) => Math.abs(a.x - midX) - Math.abs(c.x - midX) || a.x - c.x);
  } else {
    const x = best === "W" ? b.minX : b.maxX;
    for (let y = b.minY; y <= b.maxY; y++) edgeTiles.push({ x, y });
    edgeTiles.sort((a, c) => Math.abs(a.y - midY) - Math.abs(c.y - midY) || a.y - c.y);
  }
  const isOpenOcean = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT && !isWalkable(x, y);

  let dock: Vec = edgeTiles[0]!;
  for (const e of edgeTiles) {
    const onLand = regionAt(e.x, e.y) === isle;
    // Seaward neighbour must be OPEN OCEAN — not land and not a bridge/road deck.
    if (onLand && isOpenOcean(e.x + outward.x, e.y + outward.y)) { dock = e; break; }
  }

  const lane: Vec[] = [];
  for (let i = 1; i <= 2; i++) {
    const lx = dock.x + outward.x * i;
    const ly = dock.y + outward.y * i;
    if (!isOpenOcean(lx, ly)) break; // lane is open ocean only (not land, not bridge)
    lane.push({ x: lx, y: ly });
  }
  return { id, isle, dock, lane };
}

function buildPorts(): readonly Port[] {
  return [
    portForIsle("port-fishing-isle", "fishing-isle"),
    portForIsle("port-fishing-isle-2", "fishing-isle-2"),
    portForIsle("port-casino", "casino"),
  ];
}

export function ports(): readonly Port[] {
  if (!_ports) _ports = buildPorts();
  return _ports;
}

/** @deprecated prefer ports() — live-binding getter for legacy importers. */
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

export function portLaneTiles(): Vec[] {
  const set = new Map<string, Vec>();
  for (const p of ports()) for (const v of p.lane) set.set(`${v.x},${v.y}`, v);
  return [...set.values()];
}

export function isPortLaneTile(x: number, y: number): boolean {
  if (!_portLaneSet) _portLaneSet = new Set(portLaneTiles().map((t) => `${t.x},${t.y}`));
  return _portLaneSet.has(`${Math.round(x)},${Math.round(y)}`);
}
