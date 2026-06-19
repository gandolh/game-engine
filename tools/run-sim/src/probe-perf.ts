
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import WebSocket from "ws";

const PORT = 8787;
const PHASES = [1, 5, 10];
const WARMUP_MS = 10_000;
const SAMPLE_MS = 45_000;
const INIT = {
  type: "init",
  seed: 0xc0ffee,
  ticksPerDay: 1200,
  maxDays: 100,
  tickRateHz: 20,
} as const;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface ProcStat {
  pid: number;
  ppid: number;
  jiffies: number; 
  rssPages: number;
}

function readProcStat(pid: number): ProcStat | null {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = raw.lastIndexOf(")"); 
    const rest = raw.slice(close + 2).split(" ");

    const ppid = Number(rest[1]);
    const utime = Number(rest[11]);
    const stime = Number(rest[12]);
    const rssPages = Number(rest[21]);
    return { pid, ppid, jiffies: utime + stime, rssPages };
  } catch {
    return null;
  }
}

function sampleTree(rootPid: number): { jiffies: number; rssMb: number } {
  const stats: ProcStat[] = [];
  for (const entry of readdirSync("/proc")) {
    const pid = Number(entry);
    if (!Number.isInteger(pid)) continue;
    const s = readProcStat(pid);
    if (s) stats.push(s);
  }
  const children = new Map<number, number[]>();
  for (const s of stats) {
    const list = children.get(s.ppid) ?? [];
    list.push(s.pid);
    children.set(s.ppid, list);
  }
  const inTree = new Set<number>();
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.pop();
    if (pid === undefined || inTree.has(pid)) continue;
    inTree.add(pid);
    for (const c of children.get(pid) ?? []) queue.push(c);
  }
  let jiffies = 0;
  let rssPages = 0;
  for (const s of stats) {
    if (!inTree.has(s.pid)) continue;
    jiffies += s.jiffies;
    rssPages += s.rssPages;
  }
  return { jiffies, rssMb: (rssPages * 4096) / (1024 * 1024) };
}

const HZ = 100; 

interface ClientStats {
  snapshots: number;
  payloadBytes: number; 
  lastProfile: Record<string, { mean: number; p95: number; count: number }> | null;
}

class DrainClient {
  readonly stats: ClientStats = { snapshots: 0, payloadBytes: 0, lastProfile: null };
  private readonly ws: WebSocket;

  constructor(readonly id: number, profile: boolean) {
    this.ws = new WebSocket(`ws://localhost:${PORT}`);
    this.ws.on("open", () => {
      this.ws.send(JSON.stringify(INIT));
      if (profile) this.ws.send(JSON.stringify({ type: "profile", enabled: true }));
    });
    this.ws.on("message", (data) => {
      const text = data.toString();
      this.stats.payloadBytes += text.length;
      if (text.startsWith('{"type":"snapshot"')) { 
        this.stats.snapshots += 1;
      } else if (text.startsWith('{"type":"profile"')) {
        const msg = JSON.parse(text) as {
          report: Record<string, { mean: number; p95: number; count: number }>;
        };
        this.stats.lastProfile = msg.report;
      }
    });
    this.ws.on("error", (e) => console.error(`[client ${id}] error:`, e.message));
  }

  wireBytes(): number { 
    const sock = (this.ws as unknown as { _socket?: { bytesRead: number } })._socket;
    return sock?.bytesRead ?? 0;
  }

  snapshot(): { snapshots: number; payloadBytes: number; wireBytes: number } {
    return {
      snapshots: this.stats.snapshots,
      payloadBytes: this.stats.payloadBytes,
      wireBytes: this.wireBytes(),
    };
  }

  close(): void {
    this.ws.close();
  }
}

function startServer(): Promise<ChildProcess> {
  return new Promise((res, reject) => {
    const child = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: resolve(repoRoot, "games/farm/server"),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, 
    });
    const onData = (buf: Buffer): void => {
      const line = buf.toString();
      if (line.includes("listening")) res(child);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (b: Buffer) => {
      const line = b.toString().trim();
      if (line) console.error(`[server:stderr] ${line}`);
    });
    child.on("exit", (code) => reject(new Error(`server exited early (${code})`)));
    setTimeout(() => reject(new Error("server start timeout")), 30_000);
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log("[probe] starting @farm/server …");
  const server = await startServer();
  const serverPid = server.pid;
  if (serverPid === undefined) throw new Error("no server pid");
  console.log(`[probe] server up (pid ${serverPid})`);

  const clients: DrainClient[] = [];
  try {
    for (const target of PHASES) {
      while (clients.length < target) {
        clients.push(new DrainClient(clients.length, clients.length === 0));
      }
      console.log(`\n[probe] phase: ${target} sim(s) — warmup ${WARMUP_MS / 1000}s …`);
      await sleep(WARMUP_MS);

      const cpu0 = sampleTree(serverPid);
      const t0 = Date.now();
      const c0 = clients.map((c) => c.snapshot());
      await sleep(SAMPLE_MS);
      const cpu1 = sampleTree(serverPid);
      const elapsed = (Date.now() - t0) / 1000;
      const c1 = clients.map((c) => c.snapshot());

      const cpuPct = ((cpu1.jiffies - cpu0.jiffies) / HZ / elapsed) * 100;
      console.log(`[probe] === phase ${target} results (${elapsed.toFixed(1)}s window) ===`);
      console.log(
        `[probe] server CPU ${cpuPct.toFixed(1)}% of one core | RSS ${cpu1.rssMb.toFixed(0)} MB`,
      );

      let rateSum = 0;
      let raterMin = Infinity;
      let payloadSum = 0;
      let wireSum = 0;
      let snapSum = 0;
      for (let i = 0; i < clients.length; i++) {
        const a = c0[i];
        const b = c1[i];
        if (!a || !b) continue;
        const snaps = b.snapshots - a.snapshots;
        const rate = snaps / elapsed;
        rateSum += rate;
        raterMin = Math.min(raterMin, rate);
        payloadSum += b.payloadBytes - a.payloadBytes;
        wireSum += b.wireBytes - a.wireBytes;
        snapSum += snaps;
      }
      const n = clients.length;
      console.log(
        `[probe] snapshot rate: mean ${(rateSum / n).toFixed(1)}/s, min ${raterMin.toFixed(1)}/s (target 20/s)`,
      );
      console.log(
        `[probe] payload: ${(payloadSum / Math.max(1, snapSum) / 1024).toFixed(1)} KB/snap raw | ` +
          `wire ${(wireSum / n / elapsed / 1024).toFixed(1)} KB/s/client | ` +
          `deflate ratio ${(payloadSum / Math.max(1, wireSum)).toFixed(1)}x`,
      );
      const prof = clients[0]?.stats.lastProfile;
      if (prof) {
        for (const key of ["tick", "snapshot.build", "snapshot.bytes"]) {
          const m = prof[key];
          if (!m) continue;
          const unit = key === "snapshot.bytes" ? "B" : "ms";
          console.log(
            `[probe] sim0 ${key}: mean ${m.mean.toFixed(key === "snapshot.bytes" ? 0 : 3)}${unit}, ` +
              `p95 ${m.p95.toFixed(key === "snapshot.bytes" ? 0 : 3)}${unit} (n=${m.count})`,
          );
        }
      }
    }
  } finally {
    console.log("\n[probe] cleaning up …");
    for (const c of clients) c.close();
    try {
      process.kill(-serverPid, "SIGTERM");
    } catch {

    }
  }
  console.log("[probe] done");
}

main().catch((e) => {
  console.error("[probe] FAILED:", e);
  process.exit(1);
});
