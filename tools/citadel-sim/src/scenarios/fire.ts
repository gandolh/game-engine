import { isWalkable } from "@citadel/sim-core";
import type { CitadelCommand, TerrainGrid } from "@citadel/sim-core";
import { findClear } from "./helpers";

/**
 * "Fire" scenario: builds a DENSE wooden district.
 *
 * When `withWell=false`: no mitigation → high fire risk.
 * When `withWell=true`: a Well placed in range → ignition chance cut 80%.
 *
 * Layout: a storehouse and food chain (farm + mill + bakery) are placed to
 * the SOUTH of the cluster and connected by a road that runs BELOW the dense
 * wooden district. The cluster itself uses the proven 4-col × 3-row grid at
 * 3-tile spacing (same geometry as the integration test). No road tiles pass
 * through the cluster interior, so there are no firebreaks between buildings.
 *
 * Expect fire ignition within 5-15 days with no well.
 */
export function buildFireCommands(terrain: TerrainGrid, withWell: boolean): CitadelCommand[] {
  const cx = Math.floor(terrain.width / 2);
  // Shift north so the cluster has room for roads below it.
  const cy = Math.floor(terrain.height / 2) - 8;

  // Dense wooden cluster: 10 buildings in a 4-col × 3-row grid at 3-tile spacing.
  // This layout matches the integration test that proves fire occurs within 60 days.
  // Middle buildings (col=1,2,row=1) see 4 wooden neighbors → ignition chance 0.60/day.
  // CRITICAL: no road carpet through the cluster.
  const clusterTypes = [
    "house", "house", "bakery", "bakery",   // row 0
    "mill",  "mill",  "house",  "house",    // row 1
    "chapel","market","house",  "house",    // row 2 (3rd row adds more density)
  ];
  const cmds: CitadelCommand[] = [];
  const clusterPositions: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < clusterTypes.length; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const pos = findClear(terrain, 2, 2, cx + col * 3, cy + row * 3);
    clusterPositions.push(pos);
    cmds.push({ type: "placeBuilding", payload: { buildingType: clusterTypes[i]!, x: pos.x, y: pos.y } });
  }

  // Economy: storehouse + farm + mill + bakery south of the cluster.
  // Road connects them without passing through the dense district.
  const econY = cy + 12; // below the 3-row cluster
  const store  = findClear(terrain, 3, 2, cx,     econY);
  const farm1  = findClear(terrain, 3, 3, cx - 5, econY);
  const farm2  = findClear(terrain, 3, 3, cx + 4, econY);
  const mill   = findClear(terrain, 2, 2, cx - 2, econY + 4);
  const bakery = findClear(terrain, 2, 2, cx + 2, econY + 4);

  cmds.push({ type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x,  y: store.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "farm",       x: farm1.x,  y: farm1.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "farm",       x: farm2.x,  y: farm2.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "mill",       x: mill.x,   y: mill.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "bakery",     x: bakery.x, y: bakery.y } });

  // Wells placed across the cluster when mitigation is active.
  // The cluster is ~11 tiles wide; three wells spaced 4 tiles apart give
  // full coverage with the 5-tile radius: every building is within 5 tiles
  // of at least one well, cutting ignition chance by 80%.
  if (withWell) {
    const well1 = findClear(terrain, 1, 1, cx + 1, cy + 4);
    const well2 = findClear(terrain, 1, 1, cx + 5, cy + 4);
    const well3 = findClear(terrain, 1, 1, cx + 9, cy + 4);
    cmds.push({ type: "placeBuilding", payload: { buildingType: "well", x: well1.x, y: well1.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "well", x: well2.x, y: well2.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "well", x: well3.x, y: well3.y } });
  }

  // Road: economy carpet BELOW the cluster only (econY-1 downward).
  // The cluster at cy..cy+8 is safely above and has no roads through it.
  const roadTiles: Array<{ x: number; y: number }> = [];
  const roadTop  = econY - 1;
  const roadBot  = Math.max(mill.y + 1, bakery.y + 1);
  const roadLeft  = Math.min(farm1.x, store.x) - 1;
  const roadRight = Math.max(farm2.x + 2, store.x + 2) + 1;
  for (let ry = roadTop; ry <= roadBot; ry++) {
    for (let rx = roadLeft; rx <= roadRight; rx++) {
      if (isWalkable(terrain, rx, ry)) roadTiles.push({ x: rx, y: ry });
    }
  }
  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}
