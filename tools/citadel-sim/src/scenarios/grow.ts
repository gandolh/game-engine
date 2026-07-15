import type { CitadelCommand, TerrainGrid } from "@citadel/sim-core";
import { findClear, link } from "./helpers";

export function buildGrowScenario(terrain: TerrainGrid): CitadelCommand[] {
  /**
   * "Grow" scenario: a well-connected economy with 2 farms, 1 mill, 1 bakery,
   * 2 houses, 1 storehouse — enough workers to fill all slots and build a
   * real bread surplus. Population should grow past 8+ by summer/autumn.
   * Winter halts grain but a surplus stockpile should carry the town through.
   * Phase 3: also places a chapel, market, watchpost, and tradingpost for
   * needs coverage and barter opportunities.
   */
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);

  const store = findClear(terrain, 3, 2, cx, cy);
  // Farms to the east
  const farm1 = findClear(terrain, 3, 3, store.x + 5, store.y - 4);
  const farm2 = findClear(terrain, 3, 3, store.x + 5, store.y + 3);
  // Two mills to the north
  const mill1 = findClear(terrain, 2, 2, store.x - 1, store.y - 5);
  const mill2 = findClear(terrain, 2, 2, store.x + 3, store.y - 5);
  // Two bakeries to the west
  const bakery1 = findClear(terrain, 2, 2, store.x - 5, store.y - 1);
  const bakery2 = findClear(terrain, 2, 2, store.x - 5, store.y + 2);
  // Three houses to the south (popCap = 18). Brief 100 measures where population
  // settles under FOOD pressure; with only two houses the town saturates its
  // housing cap at 12 and the economy's real equilibrium is invisible.
  const house1 = findClear(terrain, 2, 2, store.x - 2, store.y + 4);
  const house2 = findClear(terrain, 2, 2, store.x + 2, store.y + 4);
  // Kept well clear of the western bakery/chapel column: parked beside them it forms a
  // dense wooden cluster and density-driven ignition burns the town down by ~day 33.
  const house3 = findClear(terrain, 2, 2, store.x, store.y + 7);
  // Phase 3: service buildings
  const chapel     = findClear(terrain, 2, 2, store.x - 8, store.y - 1);
  const market     = findClear(terrain, 2, 2, store.x - 8, store.y + 2);
  const watchpost  = findClear(terrain, 2, 2, store.x + 3, store.y + 4);
  const tradingpost = findClear(terrain, 3, 2, store.x + 7, store.y);

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse",  x: store.x,      y: store.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",        x: farm1.x,      y: farm1.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",        x: farm2.x,      y: farm2.y } },
    { type: "placeBuilding", payload: { buildingType: "mill",        x: mill1.x,      y: mill1.y } },
    { type: "placeBuilding", payload: { buildingType: "mill",        x: mill2.x,      y: mill2.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",      x: bakery1.x,    y: bakery1.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",      x: bakery2.x,    y: bakery2.y } },
    { type: "placeBuilding", payload: { buildingType: "house",       x: house1.x,     y: house1.y } },
    { type: "placeBuilding", payload: { buildingType: "house",       x: house2.x,     y: house2.y } },
    { type: "placeBuilding", payload: { buildingType: "house",       x: house3.x,     y: house3.y } },
    // Phase 3 service buildings
    { type: "placeBuilding", payload: { buildingType: "chapel",      x: chapel.x,     y: chapel.y } },
    { type: "placeBuilding", payload: { buildingType: "market",      x: market.x,     y: market.y } },
    { type: "placeBuilding", payload: { buildingType: "watchpost",   x: watchpost.x,  y: watchpost.y } },
    { type: "placeBuilding", payload: { buildingType: "tradingpost", x: tradingpost.x, y: tradingpost.y } },
  ];

  // Road network: connect all buildings to the storehouse.
  const roadTiles: Array<{ x: number; y: number }> = [];
  const storeRight = store.x + 3;
  const storeLeft = store.x - 1;
  const storeTop = store.y - 1;
  const storeBottom = store.y + 2;

  link(roadTiles, farm1.x - 1, farm1.y + 1, storeRight, store.y);
  link(roadTiles, farm2.x - 1, farm2.y + 1, storeRight, store.y + 1);
  link(roadTiles, mill1.x + 1, mill1.y + 2, store.x, storeTop);
  link(roadTiles, mill2.x, mill2.y + 2, store.x + 2, storeTop);
  link(roadTiles, bakery1.x + 2, bakery1.y + 1, storeLeft, store.y);
  link(roadTiles, bakery2.x + 2, bakery2.y + 1, storeLeft, store.y + 1);
  link(roadTiles, house1.x + 1, house1.y - 1, store.x, storeBottom);
  link(roadTiles, house2.x, house2.y - 1, store.x + 2, storeBottom);
  link(roadTiles, house3.x + 1, house3.y - 1, store.x + 1, storeBottom);
  link(roadTiles, chapel.x + 2,      chapel.y + 1,      storeLeft,  store.y);
  link(roadTiles, market.x + 2,      market.y + 1,      storeLeft,  store.y + 1);
  link(roadTiles, watchpost.x,       watchpost.y - 1,   store.x + 2, storeBottom);
  link(roadTiles, tradingpost.x,     tradingpost.y + 1, storeRight,  store.y);

  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}
