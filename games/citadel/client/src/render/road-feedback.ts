/**
 * Road-builder feedback (render-only).
 *
 * The road network is the spine of the Citadel economy — founders only ever
 * staff `connected` buildings (sim-core systems/immigration.ts) — yet the
 * `connected` flag on each building snapshot was never surfaced, so a player
 * could lay a road, leave a building unhooked, and get no signal. These pure
 * helpers pick out the buildings that SHOULD be connected but aren't, so the
 * renderer can stamp a "no road" marker over them (Anno / Settlers style).
 *
 * Pure — no GPU, no sim mutation; unit-tested headlessly. Mirrors the sim's own
 * notion of "infrastructure" (roads/walls/gates/bridges never need connecting)
 * via `getProductionDef`, so the marker set can't drift from what the sim staffs.
 */
import { getProductionDef } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";

/**
 * True when a building is one the player is expected to hook up to the road
 * network — i.e. it has worker slots (production), houses pop, or stores goods.
 * Infrastructure (road / wall / gate / bridge) is excluded: it forms the network
 * rather than depending on it, so it never warrants a "no road" marker.
 */
export function needsRoadConnection(type: string): boolean {
  const def = getProductionDef(type);
  if (def === undefined) return false;
  if (def.isRoad === true || def.isWall === true || def.isGate === true) return false;
  return def.workerSlots > 0 || def.isHousing === true || def.isStorage === true;
}

/**
 * The buildings that should be connected to a road but currently aren't — the
 * set to mark. Skips infrastructure and skips anything already `connected`.
 * Pure; given the snapshot's buildings, deterministic.
 */
export function disconnectedBuildings(
  buildings: readonly BuildingSnapshot[],
): BuildingSnapshot[] {
  const out: BuildingSnapshot[] = [];
  for (const b of buildings) {
    if (b.connected) continue;
    if (!needsRoadConnection(b.type)) continue;
    out.push(b);
  }
  return out;
}
