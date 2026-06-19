/**
 * Citadel headless sim runner.
 *
 * Drives bootstrapSim() directly on the main thread — no Worker.
 * Places a well-connected economy near the map center, then prints a per-day
 * economy summary from getSnapshot().
 *
 * Three scenarios are supported via the SCENARIO env var:
 *   SCENARIO=grow   (default) — full economy; should see pop growing and
 *                               winter halting grain but not killing the town
 *                               if autumn surplus was large enough.
 *   SCENARIO=starve — minimal economy with no autumn surplus; winter bread
 *                     shortfall triggers population decline and game-over.
 *   SCENARIO=siege  — a fortified citadel (keep + towers + garrison + walls +
 *                     gates) on top of the grow economy; raids arrive from ~day
 *                     5 and are repelled or sack the defenses.
 *
 * Usage:
 *   npm run sim:citadel
 *   SEED=0xdeadbeef MAX_DAYS=25 npm run sim:citadel
 *   SCENARIO=starve MAX_DAYS=25 npm run sim:citadel
 *   SCENARIO=siege  MAX_DAYS=25 npm run sim:citadel
 */
import { bootstrapSim, isWalkable, TerrainType } from "@citadel/sim-core";
import type { CitadelCommand, TerrainGrid } from "@citadel/sim-core";

const SEED = parseInt(process.env.SEED ?? "0x1a2b3c4d", 16) >>> 0;
const MAX_DAYS = parseInt(process.env.MAX_DAYS ?? "25", 10);
const TICKS_PER_DAY = parseInt(process.env.TICKS_PER_DAY ?? "20", 10);
const SCENARIO = process.env.SCENARIO ?? "grow";

/** Find a clear w×h region of buildable tiles near (preferX, preferY). */
function findClear(terrain: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++)
            if (!isWalkable(terrain, x + xx, y + yy)) { ok = false; break; }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

/** Find a 2×2 region overlapping a Stone tile (for quarry/mine). */
function findStone(terrain: TerrainGrid, sx: number, sy: number): { x: number; y: number } | null {
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 1 || y < 1 || x >= terrain.width - 2 || y >= terrain.height - 2) continue;
        let stone = false;
        let blocked = false;
        for (let yy = 0; yy < 2; yy++)
          for (let xx = 0; xx < 2; xx++) {
            const t = terrain.cells[(y + yy) * terrain.width + (x + xx)]!;
            if (t === TerrainType.Stone) stone = true;
            if (t === TerrainType.Water || t === TerrainType.Rough) blocked = true;
          }
        if (stone && !blocked) return { x, y };
      }
    }
  }
  return null;
}

/** Build a straight road (horizontal then vertical) from a to b, collecting tiles. */
function link(tiles: Array<{ x: number; y: number }>, ax: number, ay: number, bx: number, by: number): void {
  let x = ax;
  let y = ay;
  while (x !== bx) { tiles.push({ x, y }); x += x < bx ? 1 : -1; }
  while (y !== by) { tiles.push({ x, y }); y += y < by ? 1 : -1; }
  tiles.push({ x: bx, y: by });
}

function buildGrowScenario(terrain: TerrainGrid): CitadelCommand[] {
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
  // Two houses to the south (popCap = 12)
  const house1 = findClear(terrain, 2, 2, store.x - 2, store.y + 4);
  const house2 = findClear(terrain, 2, 2, store.x + 2, store.y + 4);
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
  link(roadTiles, chapel.x + 2,      chapel.y + 1,      storeLeft,  store.y);
  link(roadTiles, market.x + 2,      market.y + 1,      storeLeft,  store.y + 1);
  link(roadTiles, watchpost.x,       watchpost.y - 1,   store.x + 2, storeBottom);
  link(roadTiles, tradingpost.x,     tradingpost.y + 1, storeRight,  store.y);

  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}

function buildStarveScenario(terrain: TerrainGrid): CitadelCommand[] {
  /**
   * "Starve" scenario: 1 farm, 1 mill, 1 bakery — only enough to feed ~6.
   */
  const cx = Math.floor(terrain.width / 2) + 10;
  const cy = Math.floor(terrain.height / 2) + 10;

  const store = findClear(terrain, 3, 2, cx, cy);
  const farm = findClear(terrain, 3, 3, store.x + 5, store.y - 2);
  const mill = findClear(terrain, 2, 2, store.x, store.y - 5);
  const bakery = findClear(terrain, 2, 2, store.x - 5, store.y);
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

function buildSiegeScenario(terrain: TerrainGrid): CitadelCommand[] {
  /**
   * "Siege" scenario: the grow economy PLUS a fortified core. A keep anchors
   * the siege game (raids only begin once a keep exists). Towers + a garrison
   * supply defensive strength; a wall ring with gates funnels raiders and adds
   * chokepoint bonuses. Roads connect the defensive buildings to the economy.
   */
  const cmds = buildGrowScenario(terrain);

  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);

  // Keep just south-east of the economy core.
  const keep = findClear(terrain, 3, 3, cx + 10, cy + 8);
  const garrison = findClear(terrain, 3, 2, keep.x, keep.y + 4);
  const tower1 = findClear(terrain, 2, 2, keep.x - 4, keep.y);
  const tower2 = findClear(terrain, 2, 2, keep.x + 4, keep.y);
  const tower3 = findClear(terrain, 2, 2, keep.x - 4, keep.y + 4);
  const tower4 = findClear(terrain, 2, 2, keep.x + 4, keep.y + 4);

  cmds.push({ type: "placeBuilding", payload: { buildingType: "keep",     x: keep.x,     y: keep.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "garrison", x: garrison.x, y: garrison.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "tower",    x: tower1.x,   y: tower1.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "tower",    x: tower2.x,   y: tower2.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "tower",    x: tower3.x,   y: tower3.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "tower",    x: tower4.x,   y: tower4.y } });

  // A wall ring around the keep/garrison block, with a gate on each side.
  const x0 = keep.x - 2;
  const x1 = keep.x + 4;
  const y0 = keep.y - 2;
  const y1 = keep.y + 6;
  const gateN = Math.floor((x0 + x1) / 2);
  const gateS = gateN + 1;
  const gateW = Math.floor((y0 + y1) / 2);
  const gateE = gateW + 1;

  const wallTiles: Array<{ x: number; y: number }> = [];
  const gateTiles: CitadelCommand[] = [];
  for (let x = x0; x <= x1; x++) {
    // top + bottom edges
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
  // Gates first (they must not land on a wall tile), then walls.
  for (const g of gateTiles) cmds.push(g);
  cmds.push({ type: "placeWall", payload: { tiles: wallTiles } });

  // Connect the keep block to the economy core with a road.
  const roadTiles: Array<{ x: number; y: number }> = [];
  link(roadTiles, gateN, y0 - 1, cx + 1, cy + 1);
  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });

  return cmds;
}

function main(): void {
  console.log(
    `Citadel headless sim — seed=0x${SEED.toString(16)}, ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day [scenario: ${SCENARIO}]`,
  );

  const startDay = SCENARIO === "starve" ? 12 : 0;
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS, startDay });
  const { scheduler, dayClock, terrain, commands, getSnapshot } = sim;

  console.log(`Terrain generated: ${terrain.width}×${terrain.height} tiles`);

  let cmds: CitadelCommand[];
  if (SCENARIO === "starve") cmds = buildStarveScenario(terrain);
  else if (SCENARIO === "siege") cmds = buildSiegeScenario(terrain);
  else cmds = buildGrowScenario(terrain);
  for (const c of cmds) commands.enqueue(c);

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  let lastDay = -1;

  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    if (dayClock.day !== lastDay) {
      lastDay = dayClock.day;
      const snap = getSnapshot(tick);
      const connected = snap.buildings.filter((b) => b.connected).length;
      const workers = snap.villagers.length;
      const decreesStr = snap.activeDecrees.length > 0 ? ` [${snap.activeDecrees.join(",")}]` : "";
      const traderStr = snap.traderPresent ? " [TRADER]" : "";
      const siegeStr = SCENARIO === "siege"
        ? ` | threat=${snap.threatLevel} defense=${snap.defensiveStrength} raiders=${snap.raiders.length} keepSacked=${snap.keepSacked}`
        : "";
      console.log(
        `  Day ${String(snap.day + 1).padStart(2)}/${MAX_DAYS} [${snap.season.padEnd(6)}] ` +
          `pop ${snap.population}/${snap.popCap}  ` +
          `grain=${String(snap.stockpiles.grain ?? 0).padStart(3)} ` +
          `flour=${String(snap.stockpiles.flour ?? 0).padStart(3)} ` +
          `bread=${String(snap.stockpiles.bread ?? 0).padStart(3)}  ` +
          `workers=${workers} ` +
          `(connected ${connected}/${snap.buildings.length}, surplus ${snap.foodSurplus}) ` +
          `happy=${snap.happiness} faith=${(snap.faithCoverage * 100).toFixed(0)}% ` +
          `safe=${(snap.safetyCoverage * 100).toFixed(0)}% goods=${(snap.goodsCoverage * 100).toFixed(0)}%` +
          decreesStr + traderStr + siegeStr +
          (snap.gameOver ? " *** GAME OVER ***" : ""),
      );
    }
  }

  const final = getSnapshot(totalTicks);
  console.log(`\nDone. Simulated ${totalTicks} ticks (${MAX_DAYS} days).`);
  console.log(
    `Final: pop ${final.population}/${final.popCap}, bread ${final.stockpiles.bread ?? 0}, ` +
      `gameOver=${final.gameOver}`,
  );
  if (SCENARIO === "siege") {
    console.log(
      `Siege: ${final.keepPresent ? "keep present" : "no keep"}, ` +
        `threat=${final.threatLevel}, defense=${final.defensiveStrength}, ` +
        `keepSacked=${final.keepSacked}, ` +
        `stone=${final.stockpiles.stone ?? 0} planks=${final.stockpiles.planks ?? 0} tools=${final.stockpiles.tools ?? 0}`,
    );
  }
  if (final.recentEvents.length > 0) {
    console.log("Recent events:");
    for (const e of final.recentEvents.slice(-8)) console.log(`  - ${e}`);
  }
  process.exit(0);
}

main();
