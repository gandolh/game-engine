
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { buildRenderSnapshot, SnapshotSpriteState } from "@farm/sim-core/snapshot-builder";

const TICKS_PER_DAY = 20;
const DAYS = 20;

const { world, bus, scheduler, dayClock, meetIndicators, eventFeed, runHistory, rivalry } =
  bootstrapSim({ seed: 0xc0ffee, ticksPerDay: TICKS_PER_DAY, maxDays: 100 });

const spriteState = new SnapshotSpriteState();
let snap: ReturnType<typeof buildRenderSnapshot> | null = null;
for (let t = 0; t < TICKS_PER_DAY * DAYS; t++) {
  scheduler.tick({ tick: t });
  bus.notifySubscribers();
  snap = buildRenderSnapshot(
    world, dayClock, meetIndicators, eventFeed, t, 100, null, runHistory.history(), rivalry, spriteState,
  );
}

const s = snap!;
const total = JSON.stringify(s).length;
console.log(`day ${dayClock.day}, total snapshot JSON: ${(total / 1024).toFixed(1)} KB`);
const sizes: Array<[string, number]> = Object.entries(s as unknown as Record<string, unknown>)
  .map(([k, v]) => [k, JSON.stringify(v)?.length ?? 0] as [string, number])
  .sort((a, b) => b[1] - a[1]);
for (const [k, bytes] of sizes.slice(0, 12)) {
  console.log(`  ${k.padEnd(20)} ${(bytes / 1024).toFixed(2).padStart(8)} KB  (${((bytes / total) * 100).toFixed(1)}%)`);
}

const sprites = (s as unknown as { sprites: Array<{ frame?: string; kind?: string }> }).sprites;
console.log(`\nsprite count: ${sprites.length}, avg ${(104070 / sprites.length).toFixed(0)} B/sprite`);
const byPrefix = new Map<string, number>();
for (const sp of sprites) {
  const key = (sp.frame ?? sp.kind ?? "?").split("/")[0] ?? "?";
  byPrefix.set(key, (byPrefix.get(key) ?? 0) + 1);
}
for (const [k, n] of [...byPrefix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${k.padEnd(16)} ${n}`);
}
console.log("\nwealthSeries shape:", JSON.stringify((s as unknown as { wealthSeries: unknown }).wealthSeries).slice(0, 200));
console.log("\none sprite:", JSON.stringify(sprites[0]));
