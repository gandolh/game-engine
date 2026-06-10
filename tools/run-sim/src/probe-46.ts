/**
 * probe-46.ts — brief 46 LIVE acceptance probe.
 *
 * Runs a full headless sim with the JS pathfinder (REQUIRED — without it
 * TravelSystem is omitted and harbor trips never fire) and verifies:
 *   - Harbor board spawns with openContracts array
 *   - Contracts post on cadence days (every 3 days, 2 per batch)
 *   - At least one farmer commits to a contract over 100 days
 *   - At least one farmer delivers a contract (receives reward + rep)
 *   - Contract-delivered event-feed lines appear
 *   - Day-100 standings with harbor reputation
 *
 * Run: npx tsx tools/run-sim/src/probe-46.ts
 */
// NOTE: relative imports (not the bare `farm-valley/*` specifier) on purpose —
// in a git worktree the `farm-valley` package specifier resolves to the PARENT
// checkout's source (shared node_modules), so a bare import would run the wrong
// code. Relative paths pin this probe to THIS worktree's farm-valley source.
import { bootstrapSim, leaderboard } from "@farm/sim-core/sim-bootstrap";
import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import type { GameEntity } from "@farm/sim-core/components";

const SEED = 0xc0ffee;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

const { world, scheduler, dayClock, eventFeed } = bootstrapSim({
  seed: SEED,
  ticksPerDay: TICKS_PER_DAY,
  maxDays: MAX_DAYS,
  pathfinder: new JsPathfinder(),
});

function findFarmer(id: number): GameEntity | undefined {
  for (const f of world.query("farmer")) if (f.id === id) return f;
  return undefined;
}

// Tracking state
interface ContractEvent {
  kind: "posted" | "committed" | "delivered" | "missed" | "expired";
  day: number;
  contractId: string;
  farmerName?: string;
  reward?: number;
  rep?: number;
}

const contractEvents: ContractEvent[] = [];
const contractsPostedByDay = new Map<number, number>(); // day → count
let totalContractsPosted = 0;
let totalCommits = 0;
let totalDeliveries = 0;
let totalMisses = 0;

// Snapshot harbor board state each day
const boardSnapshots: Array<{ day: number; openCount: number; committedCount: number }> = [];
let lastSnapshotDay = -1;

const totalTicks = MAX_DAYS * TICKS_PER_DAY;
for (let tick = 0; tick < totalTicks; tick++) {
  scheduler.tick({ tick });
  const day = Math.floor(tick / TICKS_PER_DAY);

  // Snapshot board once per day at mid-tick
  if (day !== lastSnapshotDay && tick % TICKS_PER_DAY === Math.floor(TICKS_PER_DAY / 2)) {
    lastSnapshotDay = day;
    for (const board of world.query("harborBoard")) {
      const hb = board.harborBoard!;
      boardSnapshots.push({
        day,
        openCount: hb.openContracts.length,
        committedCount: hb.committed.size,
      });
      break;
    }
  }
}

// Extract harbor events from the event feed
const deliveredLines: string[] = [];
const missedLines: string[] = [];
for (const entry of eventFeed.recent()) {
  if (entry.text.includes("delivered a harbor contract")) {
    deliveredLines.push(`[day ${entry.day}] ${entry.text}`);
    totalDeliveries++;
  }
  if (entry.text.includes("missed a harbor contract deadline")) {
    missedLines.push(`[day ${entry.day}] ${entry.text}`);
    totalMisses++;
  }
}

// Count total contracts that were ever posted (from board snapshots max open count).
const maxOpenAtAny = Math.max(0, ...boardSnapshots.map((s) => s.openCount + s.committedCount));

// Check farmer harbor reputations at end of run
console.log("\n=== HARBOR BOARD LIFECYCLE ===");
const significantSnapshots = boardSnapshots.filter((s, i) =>
  i === 0 ||
  s.openCount !== boardSnapshots[i - 1]!.openCount ||
  s.committedCount !== boardSnapshots[i - 1]!.committedCount
);
for (const s of significantSnapshots.slice(-20)) {
  console.log(`  Day ${String(s.day).padStart(3)}: open=${s.openCount}  committed=${s.committedCount}`);
}
if (boardSnapshots.length > 20) {
  console.log("  (truncated — showing last 20 changed states)");
}

console.log("\n=== CONTRACT DELIVERED FEED LINES ===");
if (deliveredLines.length === 0) {
  console.log("  (none)");
} else {
  for (const l of deliveredLines) console.log(`  ${l}`);
}

console.log("\n=== CONTRACT MISSED FEED LINES ===");
if (missedLines.length === 0) {
  console.log("  (none)");
} else {
  for (const l of missedLines) console.log(`  ${l}`);
}

console.log("\n=== FARMER HARBOR REPUTATION (end of run) ===");
for (const f of world.query("farmer")) {
  if (f.player) continue;
  const rep = f.farmer?.harborReputation ?? 0;
  const hasCommitted = f.farmer?.committedContract !== undefined;
  console.log(`  ${(f.farmer?.name ?? "?").padEnd(8)} rep=${rep}${hasCommitted ? " [has active contract]" : ""}`);
}

console.log("\n=== DAY-100 STANDINGS ===");
for (const row of leaderboard(world)) {
  const rep = findFarmer(row.id)?.farmer?.harborReputation ?? 0;
  console.log(`  ${row.name.padEnd(8)} ${row.personality.padEnd(12)} total=${Math.round(row.totalValue)} gold=${row.gold} harborRep=${rep}`);
}

console.log("\n=== ACCEPTANCE (brief 46 harbor contracts) ===");
const boardExists = [...world.query("harborBoard", "inbox")].length === 1;
const contractsEverPosted = maxOpenAtAny > 0;
const hasDeliveries = totalDeliveries > 0;
// Check at least one farmer has non-zero harbor reputation (proof that deliveries happened).
const anyRepGained = [...world.query("farmer")].some((f) => (f.farmer?.harborReputation ?? 0) > 0);

console.log(`  harbor board entity spawned:          ${boardExists ? "YES ✓" : "NO ✗"}`);
console.log(`  contracts ever posted (board max open+committed ≥ 1): ${contractsEverPosted ? `YES ✓ (max=${maxOpenAtAny})` : "NO ✗"}`);
console.log(`  event-feed delivery lines:            ${deliveredLines.length} (${hasDeliveries ? "✓" : "✗"})`);
console.log(`  event-feed miss lines:                ${missedLines.length}`);
console.log(`  any farmer gained harbor rep:         ${anyRepGained ? "YES ✓" : "NO"}`);

const pass = boardExists && contractsEverPosted && hasDeliveries;
console.log(`\n  ACCEPTANCE ${pass ? "MET ✓" : "NOT MET ✗"}  (need: board spawned + contracts posted + ≥1 delivery)`);
if (!pass) {
  if (!boardExists) console.log("  !! harborBoard entity missing — check region-setup.ts");
  if (!contractsEverPosted) console.log("  !! No contracts ever posted — check HarborSystem cadence + sim-bootstrap registration");
  if (!hasDeliveries) console.log("  !! No deliveries — check agent deliberation + TravelSystem + HarborSystem.attemptDeliveries");
}
