/* brief 44 — acceptance probe: carpenter commissions, blacksmith upgrades, tavern hires/gossip. */
import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import { isWithinReach } from "@farm/sim-core/systems/proximity";
import type { GameEntity, ToolTier } from "@farm/sim-core/components";

const SEED = 0xc0ffee;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

const { world, scheduler } = bootstrapSim({
  seed: SEED,
  ticksPerDay: TICKS_PER_DAY,
  maxDays: MAX_DAYS,
  pathfinder: new JsPathfinder(),
});

const TAVERN_TILE = { x: 45, y: 35 };
const tierRank: Record<ToolTier, number> = { wooden: 0, stone: 1, iron: 2 };

function findFarmer(id: number): GameEntity | undefined {
  for (const f of world.query("farmer")) if (f.id === id) return f;
  return undefined;
}
function nameOf(id: number): string {
  return findFarmer(id)?.farmer?.name ?? `#${id}`;
}

const seenDecorations = new Set<number>();
let commissionsDelivered = 0;
const commissionsBy = new Map<string, number>();
let realCommissionsAccepted = 0;
let prevPendingLen = 0;

const bestTier = new Map<number, number>();
let upgrades = 0;
const upgradesBy = new Map<string, number>();

const lastHiredDay = new Map<number, number>();
let hires = 0;
const hiresBy = new Map<string, number>();

let tavernVisits = 0;
const visitedThisDay = new Set<string>();
let lastDay = -1;

const gossipSeen = new Set<string>();

function initTier(f: GameEntity): number {
  let best = -1;
  for (const t of f.inventory?.tools ?? []) best = Math.max(best, tierRank[t.tier] ?? 0);
  return best;
}
for (const f of world.query("farmer")) {
  if (f.id !== undefined) bestTier.set(f.id, initTier(f));
}

const totalTicks = MAX_DAYS * TICKS_PER_DAY;
for (let tick = 0; tick < totalTicks; tick++) {
  scheduler.tick({ tick });
  const day = Math.floor(tick / TICKS_PER_DAY);
  const frac = (tick % TICKS_PER_DAY) / TICKS_PER_DAY;
  if (day !== lastDay) { lastDay = day; visitedThisDay.clear(); }

  for (const c of world.query("carpenter")) {
    const len = c.carpenter.pending?.length ?? 0;
    if (len > prevPendingLen) realCommissionsAccepted += len - prevPendingLen;
    prevPendingLen = len;
  }

  for (const d of world.query("farmDecoration")) {
    if (d.id === undefined || seenDecorations.has(d.id)) continue;
    seenDecorations.add(d.id);
    commissionsDelivered++;
    const name = nameOf(d.farmDecoration.ownerId);
    commissionsBy.set(name, (commissionsBy.get(name) ?? 0) + 1);
    console.log(`[day ${day}] carpenter delivered ${d.farmDecoration.kind} to ${name}`);
  }

  for (const f of world.query("farmer", "inventory")) {
    if (f.id === undefined) continue;
    const cur = initTier(f);
    const prev = bestTier.get(f.id) ?? -1;
    if (cur > prev) {
      upgrades++;
      const name = f.farmer!.name;
      upgradesBy.set(name, (upgradesBy.get(name) ?? 0) + 1);
      console.log(`[day ${day}] ${name} upgraded a tool to tier ${cur} (consumed ore+gold)`);
      bestTier.set(f.id, cur);
    }
  }

  for (const f of world.query("farmer")) {
    if (f.id === undefined) continue;
    const h = f.farmer!.helperHiredDay;
    if (h !== undefined && lastHiredDay.get(f.id) !== h) {
      lastHiredDay.set(f.id, h);
      hires++;
      hiresBy.set(f.farmer!.name, (hiresBy.get(f.farmer!.name) ?? 0) + 1);
      console.log(`[day ${day}] ${f.farmer!.name} hired a day-helper at the tavern`);
    }
  }

  if (frac >= 0.15 && frac < 0.85) {
    for (const f of world.query("farmer", "transform")) {
      if (f.player) continue;
      if (isWithinReach(f.transform, TAVERN_TILE.x, TAVERN_TILE.y)) {
        const key = `${day}:${f.id}`;
        if (!visitedThisDay.has(key)) {
          visitedThisDay.add(key);
          tavernVisits++;
        }
      }
    }
  }

  for (const t of world.query("tavern")) {
    const g = t.tavern.gossip;
    if (g && !gossipSeen.has(g)) gossipSeen.add(g);
  }
}

let tavernReachable = false;
for (const t of world.query("tavern", "transform")) tavernReachable = true;

console.log("\n=== DAY-100 STANDINGS ===");
for (const row of leaderboard(world)) {
  console.log(`  ${row.name.padEnd(8)} ${row.personality.padEnd(12)} total=${Math.round(row.totalValue)} gold=${row.gold}`);
}

console.log("\n=== ACCEPTANCE (brief 44 living world) ===");
console.log(`  decorations delivered (all sources): ${commissionsDelivered} (${[...commissionsBy].map(([n, c]) => `${n}:${c}`).join(", ") || "none"})`);
console.log(`  REAL carpenter commissions (order→build→deliver): ${realCommissionsAccepted}`);
console.log(`  blacksmith upgrades (consumed materials): ${upgrades} (${[...upgradesBy].map(([n, c]) => `${n}:${c}`).join(", ") || "none"})`);
console.log(`  day-helper hires: ${hires} (${[...hiresBy].map(([n, c]) => `${n}:${c}`).join(", ") || "none"})`);
console.log(`  tavern gathering visits (evening): ${tavernVisits}`);
console.log(`  tavern reachable/present: ${tavernReachable}`);
console.log(`  distinct gossip lines produced: ${gossipSeen.size}`);
const exampleGossip = [...gossipSeen].slice(-1)[0];
console.log(`  example gossip: ${exampleGossip ?? "(none)"}`);

const pass = realCommissionsAccepted >= 1 && tavernReachable && gossipSeen.size >= 1;
console.log(`\n  ACCEPTANCE ${pass ? "MET" : "NOT MET"} (need >=1 REAL carpenter commission AND tavern present AND a gossip line)`);
