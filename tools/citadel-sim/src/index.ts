/**
 * Citadel headless sim runner.
 *
 * Drives bootstrapSim() directly on the main thread — no Worker.
 * Places a minimal test economy at tick 0, then prints a per-day economy
 * summary from getSnapshot().
 *
 * Usage:
 *   npm run sim:citadel
 *   SEED=0xdeadbeef MAX_DAYS=10 npm run sim:citadel
 */
import { bootstrapSim, isWalkable } from "@citadel/sim-core";
import type { CitadelCommand, TerrainGrid } from "@citadel/sim-core";

const SEED = parseInt(process.env.SEED ?? "0x1a2b3c4d", 16) >>> 0;
const MAX_DAYS = parseInt(process.env.MAX_DAYS ?? "10", 10);
const TICKS_PER_DAY = parseInt(process.env.TICKS_PER_DAY ?? "20", 10);

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

function main(): void {
  console.log(
    `Citadel headless sim — seed=0x${SEED.toString(16)}, ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day`,
  );

  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
  const { scheduler, dayClock, terrain, commands, getSnapshot } = sim;

  console.log(`Terrain generated: ${terrain.width}×${terrain.height} tiles`);

  // --- Build a minimal connected economy near the map center. ---
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);
  const store = findClear(terrain, 3, 2, cx, cy);
  const farm = findClear(terrain, 3, 3, store.x + 6, store.y);
  const mill = findClear(terrain, 2, 2, store.x, store.y - 6);
  const bakery = findClear(terrain, 2, 2, store.x - 6, store.y);
  const house = findClear(terrain, 2, 2, store.x, store.y + 4);

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x, y: store.y } },
    { type: "placeBuilding", payload: { buildingType: "farm", x: farm.x, y: farm.y } },
    { type: "placeBuilding", payload: { buildingType: "mill", x: mill.x, y: mill.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery", x: bakery.x, y: bakery.y } },
    { type: "placeBuilding", payload: { buildingType: "house", x: house.x, y: house.y } },
  ];
  // Roads forming a plus through the store center connecting all neighbours.
  const roadTiles: Array<{ x: number; y: number }> = [];
  const link = (ax: number, ay: number, bx: number, by: number): void => {
    let x = ax;
    let y = ay;
    while (x !== bx) { roadTiles.push({ x, y }); x += x < bx ? 1 : -1; }
    while (y !== by) { roadTiles.push({ x, y }); y += y < by ? 1 : -1; }
    roadTiles.push({ x: bx, y: by });
  };
  link(store.x - 1, store.y, bakery.x + 2, bakery.y);
  link(store.x + 3, store.y, farm.x - 1, farm.y);
  link(store.x, store.y - 1, mill.x, mill.y + 2);
  link(store.x, store.y + 2, house.x, house.y - 1);
  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });

  for (const c of cmds) commands.enqueue(c);

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  let lastDay = -1;

  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    if (dayClock.day !== lastDay) {
      lastDay = dayClock.day;
      const snap = getSnapshot(tick);
      const connected = snap.buildings.filter((b) => b.connected).length;
      console.log(
        `  Day ${snap.day + 1}/${MAX_DAYS} [${snap.season}] ` +
          `pop ${snap.population}/${snap.popCap} ` +
          `grain=${snap.stockpiles.grain ?? 0} flour=${snap.stockpiles.flour ?? 0} ` +
          `bread=${snap.stockpiles.bread ?? 0} wood=${snap.stockpiles.wood ?? 0} ` +
          `(connected ${connected}/${snap.buildings.length}, surplus ${snap.foodSurplus})`,
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
    for (const e of final.recentEvents.slice(-5)) console.log(`  - ${e}`);
  }
  process.exit(0);
}

main();
