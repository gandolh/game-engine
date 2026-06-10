/* brief 42 — confirm livestock/orchard fires live. */
import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import { totalProductCount, totalFruitCount } from "@farm/sim-core/economy";

const SEED = 0xc0ffee;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

const { world, scheduler, dayClock } = bootstrapSim({
  seed: SEED,
  ticksPerDay: TICKS_PER_DAY,
  maxDays: MAX_DAYS,
  pathfinder: new JsPathfinder(),
});

let pensBuiltPeak = 0;
const penOwners = new Set<number>();
let animalsPeak = 0;
let orchardsPeak = 0;
let orchardsMaturedPeak = 0;
let productsBankedPeak = 0;
let fruitBankedPeak = 0;

const totalTicks = MAX_DAYS * TICKS_PER_DAY;
for (let tick = 0; tick < totalTicks; tick++) {
  scheduler.tick({ tick });

  let pens = 0;
  let animals = 0;
  for (const p of world.query("pen")) {
    pens++;
    penOwners.add(p.pen.ownerId);
    animals += p.pen.count;
  }
  pensBuiltPeak = Math.max(pensBuiltPeak, pens);
  animalsPeak = Math.max(animalsPeak, animals);

  let orchards = 0;
  let matured = 0;
  for (const t of world.query("orchardTree")) {
    orchards++;
    if (t.orchardTree.mature) matured++;
  }
  orchardsPeak = Math.max(orchardsPeak, orchards);
  orchardsMaturedPeak = Math.max(orchardsMaturedPeak, matured);

  let prod = 0;
  let fruit = 0;
  for (const f of world.query("farmer", "inventory")) {
    for (const k of ["egg", "milk", "wool"] as const) prod += totalProductCount(f.inventory, k);
    for (const k of ["apple", "cherry"] as const) fruit += totalFruitCount(f.inventory, k);
  }
  productsBankedPeak = Math.max(productsBankedPeak, prod);
  fruitBankedPeak = Math.max(fruitBankedPeak, fruit);
}

console.log("=== brief 42 live probe (seed 0xc0ffee, 100 days, tpd=20) ===");
console.log("pens built (peak concurrent):", pensBuiltPeak);
console.log("distinct pen owners:", penOwners.size, [...penOwners].join(","));
console.log("animals owned (peak):", animalsPeak);
console.log("orchards planted (peak):", orchardsPeak);
console.log("orchards matured (peak):", orchardsMaturedPeak);
console.log("products banked (peak held):", productsBankedPeak);
console.log("fruit banked (peak held):", fruitBankedPeak);
console.log("final day:", dayClock.day);

const standings = leaderboard(world).sort((a, b) => b.totalValue - a.totalValue);
console.log("=== day-100 standings (by totalValue) ===");
for (const s of standings) {
  console.log(
    `  ${s.name} (${s.personality}): total ${s.totalValue}, gold ${s.gold}, ` +
      `livestock ${s.livestockValue}, assets ${s.assetValue}`,
  );
}
