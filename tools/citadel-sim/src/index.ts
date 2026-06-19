/**
 * Citadel headless sim runner.
 *
 * Drives bootstrapSim() directly on the main thread — no Worker.
 * Places a well-connected economy near the map center, then prints a per-day
 * economy summary from getSnapshot().
 *
 * Two scenarios are supported via the SCENARIO env var:
 *   SCENARIO=grow   (default) — full economy; should see pop growing and
 *                               winter halting grain but not killing the town
 *                               if autumn surplus was large enough.
 *   SCENARIO=starve — minimal economy with no autumn surplus; winter bread
 *                     shortfall triggers population decline and game-over.
 *
 * Usage:
 *   npm run sim:citadel
 *   SEED=0xdeadbeef MAX_DAYS=25 npm run sim:citadel
 *   SCENARIO=starve MAX_DAYS=25 npm run sim:citadel
 */
import { bootstrapSim, isWalkable } from "@citadel/sim-core";
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
   */
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);

  /**
   * Layout: 2 farms (east), 2 mills (north), 2 bakeries (west), 2 houses (south).
   * Total worker slots: 4 (farms) + 2 (mills) + 2 (bakeries) = 8.
   * PopCap: 2 × 6 = 12.
   * Daily capacity (summer): farms→12 grain/day, mills→8 flour/day, bakeries→12 bread/day.
   * A pop of 12 consumes 12 bread/day — right at the limit, so autumn surplus buffers winter.
   */
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

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x, y: store.y } },
    { type: "placeBuilding", payload: { buildingType: "farm", x: farm1.x, y: farm1.y } },
    { type: "placeBuilding", payload: { buildingType: "farm", x: farm2.x, y: farm2.y } },
    { type: "placeBuilding", payload: { buildingType: "mill", x: mill1.x, y: mill1.y } },
    { type: "placeBuilding", payload: { buildingType: "mill", x: mill2.x, y: mill2.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery", x: bakery1.x, y: bakery1.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery", x: bakery2.x, y: bakery2.y } },
    { type: "placeBuilding", payload: { buildingType: "house", x: house1.x, y: house1.y } },
    { type: "placeBuilding", payload: { buildingType: "house", x: house2.x, y: house2.y } },
  ];

  // Road network: connect all buildings to the storehouse.
  const roadTiles: Array<{ x: number; y: number }> = [];
  const storeRight = store.x + 3;
  const storeLeft = store.x - 1;
  const storeTop = store.y - 1;
  const storeBottom = store.y + 2;

  // Farms → store east edge
  link(roadTiles, farm1.x - 1, farm1.y + 1, storeRight, store.y);
  link(roadTiles, farm2.x - 1, farm2.y + 1, storeRight, store.y + 1);
  // Mills → store top
  link(roadTiles, mill1.x + 1, mill1.y + 2, store.x, storeTop);
  link(roadTiles, mill2.x, mill2.y + 2, store.x + 2, storeTop);
  // Bakeries → store west edge
  link(roadTiles, bakery1.x + 2, bakery1.y + 1, storeLeft, store.y);
  link(roadTiles, bakery2.x + 2, bakery2.y + 1, storeLeft, store.y + 1);
  // Houses → store bottom
  link(roadTiles, house1.x + 1, house1.y - 1, store.x, storeBottom);
  link(roadTiles, house2.x, house2.y - 1, store.x + 2, storeBottom);

  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}

function buildStarveScenario(terrain: TerrainGrid): CitadelCommand[] {
  /**
   * "Starve" scenario: 1 farm, 1 mill, 1 bakery — only enough to feed ~6.
   * 3 houses (popCap=18) allow the population to grow WAY past the bread
   * chain's capacity. By summer/autumn the population is 7-9; the bakery
   * (max 6 bread/day with 1 worker) cannot feed everyone. The daily deficit
   * (-1 to -3) accumulates. Any 3 consecutive deficit days triggers starvation;
   * in winter grain production stops, grain stockpile depletes, flour runs out,
   * bakery stops, bread=0, and the resulting sustained deficit rapidly drives
   * population to 0 (game-over).
   */
  const cx = Math.floor(terrain.width / 2) + 10;
  const cy = Math.floor(terrain.height / 2) + 10;

  const store = findClear(terrain, 3, 2, cx, cy);
  const farm = findClear(terrain, 3, 3, store.x + 5, store.y - 2);
  const mill = findClear(terrain, 2, 2, store.x, store.y - 5);
  const bakery = findClear(terrain, 2, 2, store.x - 5, store.y);
  // Three houses: popCap = 3×6 = 18 — town grows well past bread capacity
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

function main(): void {
  console.log(
    `Citadel headless sim — seed=0x${SEED.toString(16)}, ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day [scenario: ${SCENARIO}]`,
  );

  // Starve scenario begins at the start of winter (day 12 of a 16-day year),
  // simulating a town founded with NO autumn surplus. Grain = 0, chain not
  // running. The founding rations carry pioneers for only a few days.
  const startDay = SCENARIO === "starve" ? 12 : 0;
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS, startDay });
  const { scheduler, dayClock, terrain, commands, getSnapshot } = sim;

  console.log(`Terrain generated: ${terrain.width}×${terrain.height} tiles`);

  const cmds = SCENARIO === "starve" ? buildStarveScenario(terrain) : buildGrowScenario(terrain);
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
      console.log(
        `  Day ${String(snap.day + 1).padStart(2)}/${MAX_DAYS} [${snap.season.padEnd(6)}] ` +
          `pop ${snap.population}/${snap.popCap}  ` +
          `grain=${String(snap.stockpiles.grain ?? 0).padStart(3)} ` +
          `flour=${String(snap.stockpiles.flour ?? 0).padStart(3)} ` +
          `bread=${String(snap.stockpiles.bread ?? 0).padStart(3)}  ` +
          `workers=${workers} ` +
          `(connected ${connected}/${snap.buildings.length}, surplus ${snap.foodSurplus})` +
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
  if (final.recentEvents.length > 0) {
    console.log("Recent events:");
    for (const e of final.recentEvents.slice(-8)) console.log(`  - ${e}`);
  }
  process.exit(0);
}

main();
