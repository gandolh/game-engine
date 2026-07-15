import { isWalkable } from "@citadel/sim-core";
import type { CitadelCommand, TerrainGrid } from "@citadel/sim-core";
import { findClear } from "./helpers";

/**
 * "Siege" scenario: a self-contained fortified economy with all refining chains
 * running and strong enough defenses to repel the first two raids.
 *
 * Worker budget (founding window = 6 days → 6 founders):
 *   Primary types (Tier 1): farm, keep = 2 → staffed on founding days 1-2.
 *   Converter types (Tier 2): mill, bakery, sawmill, smith = 4 → staffed on
 *   founding days 3-6.
 *   All food-chain and refining converters are staffed within the 6-day window!
 *
 * Refining chains: wood (injected daily) → sawmill → planks.
 *                  stone (injected daily) → smith → tools.
 *   Injecting raw materials per day ensures both smithy and sawmill have continuous
 *   input regardless of quarry/woodcutter connectivity.
 *
 * Defense: keep(8) + garrison(10) + wall-adjacency bonus.
 *   Garrison is placed INSIDE the wall ring and CONNECTED to the economy, but
 *   since it IS a unique primary type it uses one founding slot.
 *   Wait — garrison would be a 3rd primary type, bumping one converter out of
 *   the founding window (6 slots = farm + keep + garrison + mill + bakery + sawmill,
 *   leaving smith out).  Instead we skip garrison and use walls only for bonus:
 *   keep(8) + ~16-20 adjacent walls = 24-28 defense.
 *   Raid 1 (10) → needs 15 to repel → 24 ≥ 15 → REPELLED.
 *   Raid 2 (15) → needs 22.5 → 24 ≥ 22.5 → REPELLED.
 *   Raid 3 (20) → needs 30 → 24 < 30, ≥ 10 → DAMAGE (not sacked).
 *
 * Returns { cmds, injectWoodPerDay, injectStonePerDay }.
 */
export function buildSiegeScenario(
  terrain: TerrainGrid,
): { cmds: CitadelCommand[]; injectWoodPerDay: number; injectStonePerDay: number } {
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);

  // ---------- Economy core ----------
  const store   = findClear(terrain, 3, 2, cx, cy);
  const farm1   = findClear(terrain, 3, 3, store.x + 5, store.y - 3);
  const farm2   = findClear(terrain, 3, 3, store.x + 5, store.y + 2);
  const mill1   = findClear(terrain, 2, 2, store.x - 1, store.y - 5);
  const mill2   = findClear(terrain, 2, 2, store.x + 3, store.y - 5);
  const bakery1 = findClear(terrain, 2, 2, store.x - 5, store.y - 1);
  const bakery2 = findClear(terrain, 2, 2, store.x - 5, store.y + 2);
  const house1  = findClear(terrain, 2, 2, store.x - 3, store.y + 4);
  const house2  = findClear(terrain, 2, 2, store.x,     store.y + 4);
  const house3  = findClear(terrain, 2, 2, store.x + 3, store.y + 4);
  const house4  = findClear(terrain, 2, 2, store.x,     store.y + 7);

  // ---------- Refining chain ----------
  // Sawmill and smith are converter types → get founding workers on days 3-6.
  // Wood (injected daily) feeds sawmill → planks.
  // Stone (injected daily) feeds smith → tools.
  // No quarry: raw material comes from injection so we don't need an extra
  // primary type that would displace a converter from the founding window.
  const sawmill = findClear(terrain, 2, 2, store.x - 1, store.y - 8);
  const smith   = findClear(terrain, 2, 2, store.x + 3, store.y - 8);

  // ---------- Citadel core ----------
  // Only keep (primary, day 2 founding) — no garrison, to keep primary types at 2.
  // Defense = keep(8) + 5×5 wall ring (16 walls adjacent to 3×3 keep footprint) = 24.
  // 24 ≥ 15 (raid 1 repel), 24 ≥ 22.5 (raid 2 repel), 24 < 30 (raid 3 damage).
  const keep = findClear(terrain, 3, 3, store.x + 2, store.y + 12);

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x,   y: store.y } },
    // Primary types (2): farm (day 1), keep (day 2).
    { type: "placeBuilding", payload: { buildingType: "farm",       x: farm1.x,   y: farm1.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",       x: farm2.x,   y: farm2.y } },
    // Converter types (4): mill (day 3), bakery (day 4), sawmill (day 5), smith (day 6).
    { type: "placeBuilding", payload: { buildingType: "mill",       x: mill1.x,   y: mill1.y } },
    { type: "placeBuilding", payload: { buildingType: "mill",       x: mill2.x,   y: mill2.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",     x: bakery1.x, y: bakery1.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",     x: bakery2.x, y: bakery2.y } },
    { type: "placeBuilding", payload: { buildingType: "sawmill",    x: sawmill.x, y: sawmill.y } },
    { type: "placeBuilding", payload: { buildingType: "smith",      x: smith.x,   y: smith.y } },
    // Housing: 4 houses → popCap 24
    { type: "placeBuilding", payload: { buildingType: "house",      x: house1.x,  y: house1.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house2.x,  y: house2.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house3.x,  y: house3.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house4.x,  y: house4.y } },
    // Citadel: keep only (day 2 primary).
    { type: "placeBuilding", payload: { buildingType: "keep",       x: keep.x,    y: keep.y } },
  ];

  // ---------- Wall ring tightly around the keep ----------
  // Walls placed 1 tile outside the 3×3 keep footprint → adjacent to footprint tiles.
  // 5×5 ring minus 3×3 center = 16 wall tiles, each adjacent to a keep tile.
  // Wall-adjacency bonus = +16, total defense = keep(8) + 16 = 24.
  const x0 = keep.x - 1;
  const x1 = keep.x + 3;
  const y0 = keep.y - 1;
  const y1 = keep.y + 3;
  const gateN = Math.floor((x0 + x1) / 2);
  const gateS = gateN + 1;
  const gateW = Math.floor((y0 + y1) / 2);
  const gateE = gateW + 1;

  const wallTiles: Array<{ x: number; y: number }> = [];
  const gateTiles: CitadelCommand[] = [];
  for (let x = x0; x <= x1; x++) {
    if (x === gateN) gateTiles.push({ type: "placeBuilding", payload: { buildingType: "gate", x, y: y0 } });
    else if (isWalkable(terrain, x, y0)) wallTiles.push({ x, y: y0 });
    if (x === gateS) gateTiles.push({ type: "placeBuilding", payload: { buildingType: "gate", x, y: y1 } });
    else if (isWalkable(terrain, x, y1)) wallTiles.push({ x, y: y1 });
  }
  for (let y = y0 + 1; y < y1; y++) {
    if (y === gateW) gateTiles.push({ type: "placeBuilding", payload: { buildingType: "gate", x: x0, y } });
    else if (isWalkable(terrain, x0, y)) wallTiles.push({ x: x0, y });
    if (y === gateE) gateTiles.push({ type: "placeBuilding", payload: { buildingType: "gate", x: x1, y } });
    else if (isWalkable(terrain, x1, y)) wallTiles.push({ x: x1, y });
  }
  for (const g of gateTiles) cmds.push(g);
  cmds.push({ type: "placeWall", payload: { tiles: wallTiles } });

  // ---------- Road network ----------
  // Use a full bounding-box carpet so every building in the scenario is
  // guaranteed to be road-connected to the storehouse regardless of terrain
  // obstacles that could break individual link() segments.
  //
  // Economy carpet: from the leftmost bakery to the rightmost farm, and from
  // the sawmill/smith row down to the southernmost house row.
  const roadTiles: Array<{ x: number; y: number }> = [];

  // Economy carpet (covers all food + refining buildings).
  const econLeft  = Math.min(bakery1.x, bakery2.x) - 1;
  const econRight = Math.max(farm1.x + 2, farm2.x + 2) + 1;
  const econTop   = Math.min(sawmill.y, smith.y) - 1;
  const econBot   = Math.max(house4.y + 1, house3.y + 1);
  for (let ry = econTop; ry <= econBot; ry++) {
    for (let rx = econLeft; rx <= econRight; rx++) {
      if (isWalkable(terrain, rx, ry)) roadTiles.push({ x: rx, y: ry });
    }
  }

  // Citadel carpet (covers the keep inside the wall ring).
  // We use the wall-ring bounding box + 1 tile margin.
  const citeLeft  = x0 - 1;
  const citeRight = x1 + 1;
  const citeTop   = y0 - 1;
  const citeBot   = y1 + 1;
  for (let ry = citeTop; ry <= citeBot; ry++) {
    for (let rx = citeLeft; rx <= citeRight; rx++) {
      if (isWalkable(terrain, rx, ry)) roadTiles.push({ x: rx, y: ry });
    }
  }

  // Connector spine: a vertical strip linking the economy carpet to the
  // citadel carpet (between econBot and citeTop).
  const spineX = store.x + 1;
  for (let ry = econBot + 1; ry < citeTop; ry++) {
    if (isWalkable(terrain, spineX, ry)) roadTiles.push({ x: spineX, y: ry });
  }

  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });

  // Inject 2 wood + 2 stone per day so both sawmill and smith always have
  // input materials.  This is deterministic: same injection every tick-day
  // boundary, and the amounts are fixed constants.
  return { cmds, injectWoodPerDay: 2, injectStonePerDay: 2 };
}
