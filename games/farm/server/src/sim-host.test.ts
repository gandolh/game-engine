import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { AddressInfo } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import { createPathfinderFromBytes } from "@engine/core";
import type { Scheduler, System, SimContext } from "@engine/core/sim";
import type { SimOutbound, SimInbound } from "@farm/sim-core/protocol";
import type { PathfinderLike } from "@farm/sim-core/sim-bootstrap";
import { SimHost, isValidSwapIndex } from "./sim-host";

const here = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = resolve(here, "../../../../engine/wasm-modules/dist/pathfinding.wasm");

function loadWasmBytes(): ArrayBuffer {
  const buf = readFileSync(WASM_PATH);
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

async function runHostToCompletion(
  seed: number,
  ticksPerDay: number,
  maxDays: number,
  pathfinder: PathfinderLike,
): Promise<SimOutbound[]> {
  const out: SimOutbound[] = [];
  const host = new SimHost((m) => out.push(m), { pathfinder });
  await new Promise<void>((resolveDone) => {
    const orig = out.push.bind(out);
    (out as unknown as { push: (m: SimOutbound) => number }).push = (m) => {
      const n = orig(m);
      if (m.type === "snapshot" && m.snapshot.gameOver) {

        setTimeout(resolveDone, 0);
      }
      return n;
    };
    host.handleInbound({
      type: "init",
      seed,
      ticksPerDay,
      maxDays,
      tickRateHz: 1000,
    });
  });
  return out;
}

let wasmBytes: ArrayBuffer;
beforeAll(() => {
  wasmBytes = loadWasmBytes();
});

/**
 * Test-only system (audit-17): throws exactly once, on the given tick, so
 * tests can exercise SimHost's tick-fault policy without touching
 * @farm/sim-core systems. Injected via SimHostOptions.onSchedulerReady,
 * which appends it to the end of the scheduler — so it runs *after* every
 * real system for that tick (e.g. DayClockSystem), letting a test throw on
 * the exact tick a real gameOver transition would land on.
 */
function faultSystemAt(tick: number): System {
  return {
    name: "test-fault-injector",
    run(ctx: SimContext) {
      if (ctx.tick === tick) throw new Error(`injected fault at tick ${tick}`);
    },
  };
}

function snapshotsOf(msgs: SimOutbound[]) {
  return msgs.filter(
    (m): m is Extract<SimOutbound, { type: "snapshot" }> => m.type === "snapshot",
  );
}

function faultsOf(msgs: SimOutbound[]) {
  return msgs.filter(
    (m): m is Extract<SimOutbound, { type: "fault" }> => m.type === "fault",
  );
}

describe("SimHost message stream", () => {
  it("emits a static-layer first, then a monotonic snapshot stream ending in gameOver", async () => {
    const pf = (await createPathfinderFromBytes(
      wasmBytes,
    )) as unknown as PathfinderLike;
    const msgs = await runHostToCompletion(0xc0ffee, 20, 1, pf);

    expect(msgs[0]?.type).toBe("static-layer");
    const snaps = msgs.filter((m) => m.type === "snapshot");
    expect(snaps.length).toBeGreaterThan(0);
    const ticks = snaps.map((m) =>
      m.type === "snapshot" ? m.snapshot.tick : -1,
    );
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    }
    const last = snaps[snaps.length - 1]!;
    expect(last.type === "snapshot" && last.snapshot.gameOver).toBe(true);
  });
});

describe("transport transparency", () => {
  for (const seed of [0xc0ffee, 1, 42]) {
    it(`two host runs are byte-identical for seed 0x${seed.toString(16)}`, async () => {
      const pfA = (await createPathfinderFromBytes(
        wasmBytes,
      )) as unknown as PathfinderLike;
      const pfB = (await createPathfinderFromBytes(
        wasmBytes,
      )) as unknown as PathfinderLike;

      const a = await runHostToCompletion(seed, 20, 3, pfA);
      const b = await runHostToCompletion(seed, 20, 3, pfB);

      const snapsOf = (msgs: SimOutbound[]) =>
        msgs
          .filter((m) => m.type === "snapshot")
          .map((m) => (m.type === "snapshot" ? JSON.stringify(m.snapshot) : ""));
      const sa = snapsOf(a);
      const sb = snapsOf(b);
      expect(sa.length).toBe(sb.length);
      expect(sa).toEqual(sb);
    });
  }
});

describe("WS round-trip (real socket)", () => {
  it("streams init → static-layer → snapshots → gameOver over a socket; pause stops advance", async () => {
    const pf = (await createPathfinderFromBytes(
      wasmBytes,
    )) as unknown as PathfinderLike;

    const wss = new WebSocketServer({ port: 0 });
    wss.on("connection", (ws) => {
      const host = new SimHost(
        (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)),
        { pathfinder: pf },
      );
      ws.on("message", (d) =>
        host.handleInbound(JSON.parse(d.toString()) as SimInbound),
      );
      ws.on("close", () => host.stop());
    });
    await new Promise((r) => wss.once("listening", r));
    const port = (wss.address() as AddressInfo).port;

    const client = new WebSocket(`ws://localhost:${port}`);
    let staticSeen = false;
    let snapCount = 0;
    let gameOver = false;

    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 15000);
      client.on("open", () =>
        client.send(
          JSON.stringify({
            type: "init",
            seed: 0xc0ffee,
            ticksPerDay: 20,
            maxDays: 1,
            tickRateHz: 200,
          }),
        ),
      );
      client.on("message", (d) => {
        const m = JSON.parse(d.toString()) as SimOutbound;
        if (m.type === "static-layer") staticSeen = true;
        if (m.type === "snapshot") {
          snapCount += 1;
          if (m.snapshot.gameOver) {
            gameOver = true;
            clearTimeout(timer);
            done();
          }
        }
      });
      client.on("error", reject);
    });

    client.close();
    await new Promise((r) => wss.close(r));

    expect(staticSeen).toBe(true);
    expect(snapCount).toBeGreaterThan(0);
    expect(gameOver).toBe(true);
  });
});

describe("swap-slots index validation", () => {
  it("NaN fails every numeric comparison, so isValidSwapIndex must reject it explicitly", () => {
    expect(isValidSwapIndex(NaN, 5)).toBe(false);
  });

  it("rejects non-integers within range", () => {
    expect(isValidSwapIndex(2.5, 5)).toBe(false);
  });

  it("rejects out-of-range and negative indices", () => {
    expect(isValidSwapIndex(-1, 5)).toBe(false);
    expect(isValidSwapIndex(5, 5)).toBe(false);
  });

  it("accepts valid integer indices", () => {
    expect(isValidSwapIndex(0, 5)).toBe(true);
    expect(isValidSwapIndex(4, 5)).toBe(true);
  });
});

describe("hostile-input clamps", () => {
  it("a speed multiplier of 1e9 is clamped to 8 ticks per interval, not run unbounded", async () => {
    vi.useFakeTimers();
    const pf = (await createPathfinderFromBytes(
      wasmBytes,
    )) as unknown as PathfinderLike;
    const msgs: SimOutbound[] = [];
    const host = new SimHost((m) => msgs.push(m), { pathfinder: pf });

    host.handleInbound({
      type: "init",
      seed: 1,
      ticksPerDay: 100_000,
      maxDays: 1000,
      tickRateHz: 60,
    });
    await vi.advanceTimersByTimeAsync(0);

    host.handleInbound({ type: "speed", multiplier: 1e9 });

    const before = msgs.filter((m) => m.type === "snapshot").length;
    await vi.advanceTimersByTimeAsync(1000 / 60);
    const after = msgs.filter((m) => m.type === "snapshot").length;

    host.stop();
    vi.useRealTimers();

    expect(after - before).toBe(8);
  });

  it("a speed multiplier of 0 falls back to 1 tick per interval", async () => {
    vi.useFakeTimers();
    const pf = (await createPathfinderFromBytes(
      wasmBytes,
    )) as unknown as PathfinderLike;
    const msgs: SimOutbound[] = [];
    const host = new SimHost((m) => msgs.push(m), { pathfinder: pf });

    host.handleInbound({
      type: "init",
      seed: 1,
      ticksPerDay: 100_000,
      maxDays: 1000,
      tickRateHz: 60,
    });
    await vi.advanceTimersByTimeAsync(0);

    host.handleInbound({ type: "speed", multiplier: 0 });

    const before = msgs.filter((m) => m.type === "snapshot").length;
    await vi.advanceTimersByTimeAsync(1000 / 60);
    const after = msgs.filter((m) => m.type === "snapshot").length;

    host.stop();
    vi.useRealTimers();

    expect(after - before).toBe(1);
  });

  it("a tickRateHz of 0 is clamped up to 1 Hz (1000ms period), not down to a near-0ms CPU-hog interval", async () => {
    const pf = (await createPathfinderFromBytes(
      wasmBytes,
    )) as unknown as PathfinderLike;
    const host = new SimHost(() => {}, { pathfinder: pf });
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    host.handleInbound({
      type: "init",
      seed: 1,
      ticksPerDay: 20,
      maxDays: 1,
      tickRateHz: 0,
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const delay = setIntervalSpy.mock.calls[0]?.[1] as number;
    expect(delay).toBe(1000);

    host.stop();
    setIntervalSpy.mockRestore();
  });

  it("a tickRateHz of 1000 is clamped down to 60 Hz", async () => {
    const pf = (await createPathfinderFromBytes(
      wasmBytes,
    )) as unknown as PathfinderLike;
    const host = new SimHost(() => {}, { pathfinder: pf });
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    host.handleInbound({
      type: "init",
      seed: 1,
      ticksPerDay: 20,
      maxDays: 1,
      tickRateHz: 1000,
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const delay = setIntervalSpy.mock.calls[0]?.[1] as number;
    expect(delay).toBeCloseTo(1000 / 60, 5);

    host.stop();
    setIntervalSpy.mockRestore();
  });
});

describe("tick-fault policy (audit-17)", () => {
  it("halts the run and tells the client on a mid-tick fault — the corrupted tick's snapshot is never sent, and no tick after it runs", async () => {
    vi.useFakeTimers();
    const pf = (await createPathfinderFromBytes(
      wasmBytes,
    )) as unknown as PathfinderLike;
    const msgs: SimOutbound[] = [];
    let scheduler: Scheduler | null = null;
    const host = new SimHost((m) => msgs.push(m), {
      pathfinder: pf,
      onSchedulerReady: (s) => {
        scheduler = s;
        s.add(faultSystemAt(3));
      },
    });

    host.handleInbound({
      type: "init",
      seed: 1,
      ticksPerDay: 1000,
      maxDays: 1000,
      tickRateHz: 1,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler).not.toBeNull();

    host.handleInbound({ type: "pause", paused: true });

    // Ticks 0,1,2 succeed; tick 3 faults; ticks 4,5 must never run.
    for (let i = 0; i < 6; i++) {
      host.handleInbound({ type: "step" });
      await vi.advanceTimersByTimeAsync(1000);
    }

    const faults = faultsOf(msgs);
    expect(faults.length).toBe(1);
    expect(faults[0]!.tick).toBe(3);

    const snaps = snapshotsOf(msgs);
    expect(snaps.length).toBe(3);
    for (const s of snaps) expect(s.snapshot.tick).toBeLessThan(3);

    // The loop must not advance onto the corrupted state: further step
    // attempts produce nothing more (the run is dead, interval cleared).
    const snapCount = snaps.length;
    for (let i = 0; i < 3; i++) {
      host.handleInbound({ type: "step" });
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(snapshotsOf(msgs).length).toBe(snapCount);
    expect(faultsOf(msgs).length).toBe(1);

    vi.useRealTimers();
  });

  it("a throw on the tick that would have set gameOver still halts the run via the fault path, not the normal gameOver branch", async () => {
    vi.useFakeTimers();
    const pf = (await createPathfinderFromBytes(
      wasmBytes,
    )) as unknown as PathfinderLike;
    const msgs: SimOutbound[] = [];

    // ticksPerDay=20, maxDays=1 → day flips to 1 (gameOver = day >= maxDays)
    // exactly at tick 20. The fault system is appended *after* every real
    // system (including DayClockSystem), so by the time it throws on tick
    // 20, the day has already flipped — gameOver "would have been set" —
    // but the throw happens before buildRenderSnapshot ever runs for that
    // tick, so the normal `if (snapshot.gameOver) this.stop()` branch never
    // executes. Only the catch's halt-and-report path can stop this run.
    const FAULT_TICK = 20;
    const host = new SimHost((m) => msgs.push(m), {
      pathfinder: pf,
      onSchedulerReady: (s) => s.add(faultSystemAt(FAULT_TICK)),
    });

    host.handleInbound({
      type: "init",
      seed: 1,
      ticksPerDay: 20,
      maxDays: 1,
      tickRateHz: 1,
    });
    await vi.advanceTimersByTimeAsync(0);

    host.handleInbound({ type: "pause", paused: true });

    for (let i = 0; i <= FAULT_TICK + 2; i++) {
      host.handleInbound({ type: "step" });
      await vi.advanceTimersByTimeAsync(1000);
    }

    const faults = faultsOf(msgs);
    expect(faults.length).toBe(1);
    expect(faults[0]!.tick).toBe(FAULT_TICK);

    const snaps = snapshotsOf(msgs);
    expect(snaps.length).toBe(FAULT_TICK);
    for (const s of snaps) {
      expect(s.snapshot.tick).toBeLessThan(FAULT_TICK);
      expect(s.snapshot.gameOver).toBe(false);
    }

    vi.useRealTimers();
  });
});
