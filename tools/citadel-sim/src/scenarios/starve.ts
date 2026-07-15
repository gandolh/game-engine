import type { CitadelCommand, TerrainGrid } from "@citadel/sim-core";
import { findClear, link } from "./helpers";

export function buildStarveScenario(terrain: TerrainGrid): CitadelCommand[] {
  /**
   * "Starve" scenario: 1 farm, 1 mill, 1 bakery — only enough to feed ~6 — and,
   * since brief 100, deliberately BADLY LAID OUT.
   *
   * Each producer sits at the end of a long spoke from the storehouse. Everything is
   * connected (production requires it), but a hauler's round trip eats most of a day,
   * so output buffers back up: the service EWMA never clears the sustained-service
   * band, the buildings earn no output bonus, and the buffer throttle pulls them
   * toward the floor. That is the brief-100 downside and upside in one fixture — the
   * town starves *because of how it was built*, not merely because it owns few farms.
   *
   * Placed short spokes, it survives comfortably on the service bonus (measured: pop 6
   * and alive at day 40), which is exactly the point.
   */
  const cx = Math.floor(terrain.width / 2) + 10;
  const cy = Math.floor(terrain.height / 2) + 10;

  const SPOKE = 16; // long enough that a hauler round trip dominates the cycle

  const store = findClear(terrain, 3, 2, cx, cy);
  const farm = findClear(terrain, 3, 3, store.x + SPOKE, store.y - 2);
  const mill = findClear(terrain, 2, 2, store.x, store.y - SPOKE);
  const bakery = findClear(terrain, 2, 2, store.x - SPOKE, store.y);
  const house1 = findClear(terrain, 2, 2, store.x - 3, store.y + 4);
  const house2 = findClear(terrain, 2, 2, store.x, store.y + 4);
  const house3 = findClear(terrain, 2, 2, store.x + 3, store.y + 4);

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x, y: store.y } },
    { type: "placeBuilding", payload: { buildingType: "farm", x: farm.x, y: farm.y } },
    { type: "placeBuilding", payload: { buildingType: "mill", x: mill.x, y: mill.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery", x: bakery.x, y: bakery.y } },
    { type: "placeBuilding", payload: { buildingType: "house", x: house1.x, y: house1.y } },
    { type: "placeBuilding", payload: { buildingType: "house", x: house2.x, y: house2.y } },
    { type: "placeBuilding", payload: { buildingType: "house", x: house3.x, y: house3.y } },
  ];

  const roadTiles: Array<{ x: number; y: number }> = [];
  const storeRight = store.x + 3;
  const storeLeft = store.x - 1;
  const storeTop = store.y - 1;
  const storeBottom = store.y + 2;
  link(roadTiles, farm.x - 1, farm.y + 1, storeRight, store.y);
  link(roadTiles, mill.x + 1, mill.y + 2, store.x + 1, storeTop);
  link(roadTiles, bakery.x + 2, bakery.y + 1, storeLeft, store.y + 1);
  link(roadTiles, house1.x + 1, house1.y - 1, store.x, storeBottom);
  link(roadTiles, house2.x + 1, house2.y - 1, store.x + 1, storeBottom);
  link(roadTiles, house3.x, house3.y - 1, store.x + 2, storeBottom);
  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}
