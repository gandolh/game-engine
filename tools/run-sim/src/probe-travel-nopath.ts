
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createPathfinderFromBytes } from "@engine/core";
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import type { GameEntity } from "@farm/sim-core/components";

const here = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(here, "../../../packages/wasm-modules/dist/pathfinding.wasm");
const buf = readFileSync(wasmPath);
const pathfinder = await createPathfinderFromBytes(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
);

const TICKS_PER_DAY = 1200;
const DAYS = 8;
const sim = bootstrapSim({ seed: 0xc0ffee, ticksPerDay: TICKS_PER_DAY, maxDays: 20, pathfinder });

const byId = new Map<number, GameEntity>();
for (const f of sim.farmers) if (f.id !== undefined) byId.set(f.id, f);

interface Drop {
  tick: number;
  farmerId: number;
  name: string;
  personality: string;
  aboard: boolean;
  from: string;
  targetTile: string;
  intentSummary: string;
  queueRest: string;
}
const drops: Drop[] = [];
const regionDrops = new Map<string, number>();
let otherNoPath = 0;
let curTick = 0;

const origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const msg = String(args[0] ?? "");
  if (!msg.includes("[travel] no path")) return origWarn(...args);

  if (!msg.includes("to tile")) {
    otherNoPath++;
    const region = /to region '([^']*)'/.exec(msg)?.[1] ?? "?";
    const from = /from \(([^)]*)\)/.exec(msg)?.[1] ?? "?";
    const fid = /farmer (\d+)/.exec(msg)?.[1] ?? "?";
    const f = byId.get(Number(fid));
    const key = `${region} <- (${from}) farmer ${fid} ${f?.farmer?.name ?? "?"} aboard=${f?.farmer?.aboard ?? "?"}`;
    regionDrops.set(key, (regionDrops.get(key) ?? 0) + 1);
    return;
  }
  const idMatch = /farmer (\d+)/.exec(msg);
  const id = idMatch ? Number(idMatch[1]) : -1;
  const f = byId.get(id);
  const front = f?.intentions?.queue[0];
  const tt = front?.data?.["targetTile"] as { x: number; y: number } | undefined;
  drops.push({
    tick: curTick,
    farmerId: id,
    name: f?.farmer?.name ?? "?",
    personality: f?.personality?.kind ?? "?",
    aboard: f?.farmer?.aboard ?? false,
    from: `(${f?.transform?.x.toFixed(0)},${f?.transform?.y.toFixed(0)})`,
    targetTile: tt ? `(${tt.x},${tt.y})` : "??",
    intentSummary: front ? `${front.kind}:${JSON.stringify(front.data ?? {}).slice(0, 120)}` : "?",
    queueRest: (f?.intentions?.queue ?? []).slice(1, 3).map((i) => i.kind).join(","),
  });
};

for (let t = 0; t < TICKS_PER_DAY * DAYS; t++) {
  curTick = t;
  sim.scheduler.tick({ tick: t });
  sim.bus.notifySubscribers();
}
console.warn = origWarn;

console.log(`\n${DAYS} days × ${TICKS_PER_DAY} ticks: ${drops.length} tile-target drops, ${otherNoPath} region-target drops`);
for (const [region, n] of [...regionDrops.entries()].sort((a, b) => b[1] - a[1])) console.log(`  region '${region}': ${n}`);
const byFarmer = new Map<string, number>();
for (const d of drops) byFarmer.set(`${d.farmerId} ${d.name} (${d.personality})`, (byFarmer.get(`${d.farmerId} ${d.name} (${d.personality})`) ?? 0) + 1);
for (const [k, n] of [...byFarmer.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× farmer ${k}`);
console.log("\nfirst 8 drops:");
for (const d of drops.slice(0, 8)) {
  console.log(`  t${d.tick} (day ${(d.tick / TICKS_PER_DAY).toFixed(1)}) #${d.farmerId} ${d.name} aboard=${d.aboard} at ${d.from} -> tile ${d.targetTile}\n    intent ${d.intentSummary} | rest: ${d.queueRest}`);
}
