/**
 * Wave-3.5 diagnostic v2 (scratch, not committed): can solo cozy reach Town
 * legitimately once the harness sites woodcutters on forest (the v1 probe bug)
 * and grows bread throughput (the real ceiling)? Drip-places one building per
 * day when affordable, bread chain before services — a patient player.
 * Run: npx tsx tools/citadel-sim/src/econ-diag.mts
 */
import { bootstrapSim, isWalkable, localPlayer } from "@citadel/sim-core";

const SEED = 0x1a2b3c4d;
const TPD = 20;
const DAYS = 250;

const sim = bootstrapSim({
  seed: SEED,
  ticksPerDay: TPD,
  cozyThreats: true,
  seedTown: true,
  chargeBuildCost: true,
  startingStock: { wood: 40 },
  deferThreatsUntilBuildings: 6,
});
/* eslint-disable @typescript-eslint/no-explicit-any */
const { scheduler, dayClock, terrain, commands } = sim as any;
const state = (sim as any).state;

const W = terrain.width as number;
const walkable = (x: number, y: number): boolean => isWalkable(terrain, x, y);

function claim(occ: Set<number>, x: number, y: number, w: number, h: number): void {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) occ.add((y + yy) * W + (x + xx));
}

function findClear(w: number, h: number, sx: number, sy: number, occ: Set<number>): { x: number; y: number } | null {
  for (let r = 2; r < 45; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < 2 || y < 2 || x + w >= W - 2 || y + h >= terrain.height - 2) continue;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++) {
            if (!walkable(x + xx, y + yy) || occ.has((y + yy) * W + (x + xx))) { ok = false; break; }
          }
        if (ok) { claim(occ, x, y, w, h); return { x, y }; }
      }
  return null;
}

/** Footprint touches >=1 Forest tile (TerrainType.Forest === 2); other tiles buildable. */
function findForestSpot(w: number, h: number, sx: number, sy: number, occ: Set<number>): { x: number; y: number } | null {
  const Forest = 2;
  for (let r = 2; r < 60; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < 2 || y < 2 || x + w >= W - 2 || y + h >= terrain.height - 2) continue;
        let ok = true, hasForest = false;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++) {
            const k = (y + yy) * W + (x + xx);
            const v = terrain.cells[k];
            if (occ.has(k)) { ok = false; break; }
            if (v === Forest) hasForest = true;
            else if (v !== 0 && v !== 4) { ok = false; break; }
          }
        if (ok && hasForest) { claim(occ, x, y, w, h); return { x, y }; }
      }
  return null;
}

function findStoneSpot(w: number, h: number, occ: Set<number>, ax: number, ay: number): { x: number; y: number } | null {
  const Stone = 3;
  let best: { x: number; y: number } | null = null, bestD = 1e9;
  for (let y = 2; y < terrain.height - h - 2; y++)
    for (let x = 2; x < W - w - 2; x++) {
      let ok = true, hasStone = false;
      for (let yy = 0; yy < h && ok; yy++)
        for (let xx = 0; xx < w; xx++) {
          const k = (y + yy) * W + (x + xx);
          const v = terrain.cells[k];
          if (occ.has(k)) { ok = false; break; }
          if (v === Stone) hasStone = true;
          else if (v !== 0 && v !== 4) { ok = false; break; }
        }
      if (ok && hasStone) {
        const d = Math.abs(x - ax) + Math.abs(y - ay);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
  if (best) claim(occ, best.x, best.y, w, h);
  return best;
}

const occ = new Set<number>();
for (const e of state.buildingWorld.query("building")) {
  const b = e.building;
  claim(occ, b.x, b.y, b.w, b.h);
}
const anchor = ((): { x: number; y: number } => {
  for (const e of state.buildingWorld.query("building")) if (e.building.type === "storehouse") return { x: e.building.x, y: e.building.y };
  return { x: Math.floor(W / 2), y: Math.floor(terrain.height / 2) };
})();

/** Road-carpet the gaps of the current town bounding box. */
function carpet(): void {
  const solid: Array<{ x: number; y: number; w: number; h: number }> = [];
  const roads = new Set<number>();
  for (const e of state.buildingWorld.query("building")) {
    const b = e.building;
    if (b.type === "road" || b.type === "bridge") roads.add(b.y * W + b.x);
    else solid.push({ x: b.x, y: b.y, w: b.w, h: b.h });
  }
  const socc = new Set<number>();
  for (const b of solid) for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) socc.add((b.y + yy) * W + (b.x + xx));
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (const b of solid) { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); }
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = minY - 1; y <= maxY; y++) for (let x = minX - 1; x <= maxX; x++) {
    const k = y * W + x;
    if (walkable(x, y) && !socc.has(k) && !roads.has(k)) tiles.push({ x, y });
  }
  if (tiles.length) commands.enqueue({ type: "placeRoad", payload: { tiles } });
  // Road tiles block future building placement ("those tiles are taken") — claim
  // them in the planner's occupancy so findClear never sites a building on one.
  for (const t of tiles) occ.add(t.y * W + t.x);
  for (const k of roads) occ.add(k);
}

// Day 0: two forest-sited woodcutters + two houses (2+2+4+4 = 12 of the 40 grant).
for (let i = 0; i < 2; i++) {
  const p = findForestSpot(2, 2, anchor.x, anchor.y, occ);
  if (p) { commands.enqueue({ type: "placeBuilding", payload: { buildingType: "woodcutter", x: p.x, y: p.y } }); console.log(`woodcutter sited at ${p.x},${p.y}`); }
  else console.log(`NO forest spot for woodcutter ${i}`);
}
for (let i = 0; i < 2; i++) {
  const p = findClear(2, 2, anchor.x, anchor.y, occ);
  if (p) commands.enqueue({ type: "placeBuilding", payload: { buildingType: "house", x: p.x, y: p.y } });
}

const COSTS: Record<string, number> = { bakery: 6, farm: 3, mill: 6, house: 4, well: 4, healer: 8, market: 6, watchpost: 6, chapel: 8, woodcutter: 2, quarry: 6, keep: 12 };
// v4: the ENTIRE second bread line lands in the first week (v1 showed the early
// seeded-bread surplus window is what lets immigration staff a second line
// before the 6-7 pop equilibrium locks). Services and spare houses after.
const drip: Array<[string, number, number]> = [
  ["farm", 3, 3], ["bakery", 2, 2], ["mill", 2, 2], ["house", 2, 2],
  ["well", 1, 1], ["house", 2, 2],
  ["market", 2, 2], ["chapel", 2, 2], ["watchpost", 2, 2], ["healer", 2, 2], ["house", 2, 2],
];

let lastDay = -1;
let carpetSoon = 0;
let quarryDone = false, keepDone = false, townDay = -1, keepDay = -1;
const totalTicks = DAYS * TPD;
for (let tick = 0; tick < totalTicks; tick++) {
  scheduler.tick({ tick });
  if (dayClock.day === lastDay) continue;
  lastDay = dayClock.day;
  const p = localPlayer(state);

  if (lastDay === 1) carpet(); // connect the day-0 placements

  if (drip.length > 0) {
    const next = drip[0]!;
    const [type, w, h] = next;
    if (p.stockpiles.wood >= (COSTS[type] ?? 8) + 2) {
      const pos = findClear(w, h, anchor.x, anchor.y, occ);
      if (pos) {
        commands.enqueue({ type: "placeBuilding", payload: { buildingType: type, x: pos.x, y: pos.y } });
        console.log(`day ${lastDay}: placed ${type} (wood ${p.stockpiles.wood})`);
        carpetSoon = 2;
      } else console.log(`day ${lastDay}: NO SPOT for ${type}`);
      drip.shift();
    }
  } else if (!quarryDone && p.stockpiles.wood >= 8) {
    const pos = findStoneSpot(2, 2, occ, anchor.x, anchor.y);
    if (pos) { commands.enqueue({ type: "placeBuilding", payload: { buildingType: "quarry", x: pos.x, y: pos.y } }); console.log(`day ${lastDay}: placed quarry at ${pos.x},${pos.y}`); carpetSoon = 2; }
    else console.log(`day ${lastDay}: NO stone spot`);
    quarryDone = true;
  } else if (quarryDone && !keepDone && (p.peakTier === "Town" || p.tier === "Town") && p.stockpiles.wood >= 14 && p.stockpiles.stone >= 8) {
    const pos = findClear(3, 3, anchor.x, anchor.y + 12, occ);
    if (pos) { commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: pos.x, y: pos.y } }); keepDay = lastDay; console.log(`day ${lastDay}: KEEP ordered at ${pos.x},${pos.y}`); carpetSoon = 2; }
    keepDone = true;
  }
  if (carpetSoon > 0 && --carpetSoon === 0) carpet();

  if (townDay < 0 && (p.tier === "Town" || p.peakTier === "Town")) { townDay = lastDay; console.log(`day ${lastDay}: *** TOWN EARNED *** pop=${p.population}`); }

  if (lastDay % 10 === 0) {
    let nonRoad = 0, staffed = 0;
    for (const e of state.buildingWorld.query("building")) {
      const b = e.building;
      if (b.type === "road" || b.type === "bridge") continue;
      nonRoad++;
      const rs = state.buildingState.get(e.id);
      if (rs && rs.workerCount > 0) staffed++;
    }
    console.log(`day ${String(lastDay).padStart(3)} pop=${p.population}/${p.popCap} tier=${p.tier} peak=${p.peakTier} bld=${nonRoad}(${staffed} staffed) wood=${p.stockpiles.wood} stone=${p.stockpiles.stone} bread=${p.stockpiles.bread} grain=${p.stockpiles.grain} flour=${p.stockpiles.flour} happy=${Math.round(p.happiness)}`);
  }
}
const fp = localPlayer(state);
console.log(`FINAL day ${dayClock.day}: pop=${fp.population}/${fp.popCap} tier=${fp.tier} peak=${fp.peakTier} townDay=${townDay} keepDay=${keepDay} keepPos=${JSON.stringify(fp.keepPosition)}`);
