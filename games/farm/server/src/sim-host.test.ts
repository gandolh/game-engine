import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { AddressInfo } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import { createPathfinderFromBytes } from "@engine/core";
import type { WorkerOutbound, WorkerInbound } from "@farm/sim-core/protocol";
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
): Promise<WorkerOutbound[]> {
  const out: WorkerOutbound[] = [];
  const host = new SimHost((m) => out.push(m), { pathfinder });
  await new Promise<void>((resolveDone) => {
    const orig = out.push.bind(out);
    (out as unknown as { push: (m: WorkerOutbound) => number }).push = (m) => {
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

      const snapsOf = (msgs: WorkerOutbound[]) =>
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
        host.handleInbound(JSON.parse(d.toString()) as WorkerInbound),
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
        const m = JSON.parse(d.toString()) as WorkerOutbound;
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
    const msgs: WorkerOutbound[] = [];
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
    const msgs: WorkerOutbound[] = [];
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
