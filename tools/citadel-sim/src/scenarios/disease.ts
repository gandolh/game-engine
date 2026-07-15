import type { CitadelCommand, TerrainGrid } from "@citadel/sim-core";
import { findClear } from "./helpers";
import { isWalkable } from "@citadel/sim-core";

/**
 * "Disease" scenario: deliberately OVERCROWDED housing to guarantee outbreak.
 *
 * Key insight: crowding = population / houseCount. To get high crowding we
 * need FEW houses (low denominator) and a strong food chain that fills the
 * population cap quickly (high numerator).
 *
 * Setup: 2 houses (popCap=12) + 2 farms + 1 mill + 1 bakery.
 * Workers fill slots over 5-6 "founding" days. By day 10-12, pop reaches 8-10.
 * Crowding = 8/2 = 4 → onsetChance = (4-1)*0.12 = 0.36 per day.
 * No service buildings → happiness stays low (25-40) → unhappyFactor amplifies.
 *
 * IMPORTANT: Buildings are kept SPARSE enough that no building has ≥3 wooden
 * neighbors within 4 tiles, so fire hazard does NOT trigger (this scenario
 * demonstrates DISEASE only, not both hazards simultaneously).
 *
 * When withHealer=true: a Healer is placed to demonstrate mortality reduction.
 * With healer: death rate 0.05% + no min death guaranteed → far fewer deaths.
 */
export function buildDiseaseScenario(terrain: TerrainGrid, withHealer = true): CitadelCommand[] {
  // Offset far from center to avoid overlap with other scenarios.
  const cx = Math.floor(terrain.width / 2) - 20;
  const cy = Math.floor(terrain.height / 2) + 15;

  // 2 houses → popCap=12, crowding = pop/2.
  // Economy buildings placed FAR APART (>5 tiles) so fire density threshold stays < 3.
  const store  = findClear(terrain, 3, 2, cx,      cy);
  const house1 = findClear(terrain, 2, 2, cx - 7,  cy);
  const house2 = findClear(terrain, 2, 2, cx - 7,  cy + 5);
  // Food chain: 2 farms (north, spaced 10 apart), 1 mill, 1 bakery.
  // All wooden buildings are ≥5 tiles apart so no wooden building has 3 neighbors.
  const farm1  = findClear(terrain, 3, 3, cx + 5,  cy - 3);
  const farm2  = findClear(terrain, 3, 3, cx + 5,  cy + 4);
  const mill   = findClear(terrain, 2, 2, cx,      cy - 6);  // ≥5 tiles from nearest wooden
  const bakery = findClear(terrain, 2, 2, cx - 7,  cy - 6);  // ≥5 tiles from mill
  // Healer placed between the two houses.
  const healer = findClear(terrain, 2, 2, cx - 7,  cy + 2);

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x,  y: store.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house1.x, y: house1.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house2.x, y: house2.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",       x: farm1.x,  y: farm1.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",       x: farm2.x,  y: farm2.y } },
    { type: "placeBuilding", payload: { buildingType: "mill",       x: mill.x,   y: mill.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",     x: bakery.x, y: bakery.y } },
  ];
  // Healer placed near both houses — only when mitigation is active.
  if (withHealer) {
    cmds.push({ type: "placeBuilding", payload: { buildingType: "healer", x: healer.x, y: healer.y } });
  }

  const roadTiles: Array<{ x: number; y: number }> = [];
  const left  = Math.min(house1.x, bakery.x) - 1;
  const right = Math.max(farm1.x + 2, farm2.x + 2) + 1;
  const top   = Math.min(mill.y, bakery.y) - 1;
  const bot   = Math.max(farm2.y + 2, house2.y + 1);
  for (let ry = top; ry <= bot; ry++) {
    for (let rx = left; rx <= right; rx++) {
      if (isWalkable(terrain, rx, ry)) roadTiles.push({ x: rx, y: ry });
    }
  }
  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}
