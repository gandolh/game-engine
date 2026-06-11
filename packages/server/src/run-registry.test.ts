/**
 * run-registry.test.ts — headless tests for RunRegistry (brief 72).
 *
 * All tests use:
 *   - FakeSocket: a lightweight ClientSocket stub that records sent payloads
 *   - StubHost: a minimal SimHost-shaped stub that records calls and allows the
 *     test to drive fan-out messages directly (no real simulation, no WASM).
 *
 * The registry is the system under test; SimHost and WebSocket are not involved
 * so the suite runs fast and deterministically.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RunRegistry } from "./run-registry";
import type { ClientSocket, MakeHostFn } from "./run-registry";
import type { WorkerInitMsg, WorkerOutbound, WorkerStaticLayerMsg, WorkerSnapshotMsg } from "@farm/sim-core/protocol";
import type { SendFn } from "./sim-host";

// ---------------------------------------------------------------------------
// Fake socket
// ---------------------------------------------------------------------------

class FakeSocket implements ClientSocket {
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState: number = this.OPEN;
  bufferedAmount = 0;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  sentParsed(): WorkerOutbound[] {
    return this.sent.map((s) => JSON.parse(s) as WorkerOutbound);
  }

  lastParsed(): WorkerOutbound | undefined {
    const s = this.sent[this.sent.length - 1];
    return s !== undefined ? (JSON.parse(s) as WorkerOutbound) : undefined;
  }
}

// ---------------------------------------------------------------------------
// Stub host
// ---------------------------------------------------------------------------

class StubHost {
  stopped = false;
  inboundLog: WorkerInitMsg[] = [];
  controlLog: Array<WorkerOutbound | { type: string }> = [];

  /** The send function provided at construction; call it to simulate server output. */
  _send: SendFn;

  constructor(send: SendFn) {
    this._send = send;
  }

  handleInbound(msg: WorkerInitMsg | { type: string }): void {
    if ((msg as WorkerInitMsg).type === "init") {
      this.inboundLog.push(msg as WorkerInitMsg);
    } else {
      this.controlLog.push(msg as WorkerOutbound);
    }
  }

  stop(): void {
    this.stopped = true;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInit(seed = 1, ticksPerDay = 20, maxDays = 5): WorkerInitMsg {
  return { type: "init", seed, ticksPerDay, maxDays, tickRateHz: 20 };
}

function makeStaticMsg(): WorkerStaticLayerMsg {
  return {
    type: "static-layer",
    sprites: [],
    worldWidthPx: 800,
    worldHeightPx: 600,
  };
}

function makeSnapshotMsg(day = 1): WorkerSnapshotMsg {
  return {
    type: "snapshot",
    snapshot: {
      // Minimal shape — only the fields the registry reads (wealthSeries).
      wealthSeries: [{ farmerId: 1, name: "Alice", personality: "conservative", rows: [] }],
      day,
      tick: day * 20,
      sprites: [],
      entityCount: 0,
      gameOver: false,
      leaderboard: [],
      slate: [],
      meets: [],
      events: [],
      relationships: { farmers: [], trust: {} },
      rivalries: [],
      finalSummary: null,
      recap: null,
      shock: null,
      weather: { season: "spring", condition: "sunny" },
      playerHotbar: null,
      playerInventory: null,
      observer: null,
    } as unknown as WorkerSnapshotMsg["snapshot"],
  };
}

let stubs: StubHost[] = [];

function makeRegistry(reapGraceMs = 50): { registry: RunRegistry; stubs: StubHost[] } {
  stubs = [];
  const makeHost: MakeHostFn = (send, _init) => {
    const stub = new StubHost(send);
    stubs.push(stub);
    // Return the stub cast as the expected SimHost type
    return stub as unknown as ReturnType<MakeHostFn>;
  };
  const registry = new RunRegistry(makeHost, { reapGraceMs });
  return { registry, stubs };
}

// ---------------------------------------------------------------------------
// Test suite 1 — same run key shares one host; fan-out reaches both sockets
// ---------------------------------------------------------------------------

describe("RunRegistry — run sharing", () => {
  it("two attachInit with identical params → one run, one host; both sockets receive the same fan-out payload", () => {
    const { registry } = makeRegistry();
    const init = makeInit();
    const a = new FakeSocket();
    const b = new FakeSocket();

    registry.attachInit(a, init);
    registry.attachInit(b, init);

    // One run should exist.
    expect(registry.runCount()).toBe(1);
    // One stub host should have been created.
    expect(stubs.length).toBe(1);

    // Drive a fan-out message through the run's send callback.
    const stub = stubs[0]!;
    const staticMsg = makeStaticMsg();
    stub._send(staticMsg);

    // Both sockets should have received the same payload.
    const lastA = a.sent[a.sent.length - 1];
    const lastB = b.sent[b.sent.length - 1];
    expect(lastA).toBeDefined();
    expect(lastB).toBeDefined();
    expect(lastA).toBe(lastB); // identical payload string (stringify-once)
  });

  it("two different run keys → two separate runs and hosts", () => {
    const { registry } = makeRegistry();
    const a = new FakeSocket();
    const b = new FakeSocket();

    registry.attachInit(a, makeInit(1));
    registry.attachInit(b, makeInit(2)); // different seed

    expect(registry.runCount()).toBe(2);
    expect(stubs.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test suite 2 — ownership and control routing
// ---------------------------------------------------------------------------

describe("RunRegistry — owner control", () => {
  let registry: RunRegistry;
  let owner: FakeSocket;
  let spectator: FakeSocket;
  let stub: StubHost;

  beforeEach(() => {
    ({ registry } = makeRegistry());
    owner = new FakeSocket();
    spectator = new FakeSocket();
    const init = makeInit();

    registry.attachInit(owner, init);
    registry.attachInit(spectator, init);
    stub = stubs[0]!;
  });

  it("first attached socket receives owner:true", () => {
    const attachMsg = owner.sentParsed().find((m) => m.type === "attach");
    expect(attachMsg).toEqual({ type: "attach", owner: true });
  });

  it("second attached socket receives owner:false", () => {
    const attachMsg = spectator.sentParsed().find((m) => m.type === "attach");
    expect(attachMsg).toEqual({ type: "attach", owner: false });
  });

  it("pause from owner IS forwarded to the host", () => {
    registry.handleControl(owner, { type: "pause", paused: true });
    expect(stub.controlLog).toHaveLength(1);
    expect(stub.controlLog[0]).toEqual({ type: "pause", paused: true });
  });

  it("pause from spectator is NOT forwarded to the host", () => {
    registry.handleControl(spectator, { type: "pause", paused: true });
    expect(stub.controlLog).toHaveLength(0);
  });

  // Brief 78 — Pip-movement regression guard. The reported "Pip doesn't move"
  // symptom traced to duplicate dev processes producing a second socket that
  // attached as a spectator (owner:false), whose input the render-loop swallows.
  // These lock the invariant the single-player path depends on: the OWNER's
  // input reaches the host (→ applyInput → pendingMove → PlayerControlSystem),
  // while a spectator's input is dropped. A regression that gated the owner's
  // input (or ungated a spectator's) would fail here headlessly.
  it("input from owner IS forwarded to the host", () => {
    registry.handleControl(owner, { type: "input", moveX: "right", moveY: null, action: false, selectSlot: null });
    expect(stub.controlLog).toHaveLength(1);
    expect(stub.controlLog[0]).toEqual({ type: "input", moveX: "right", moveY: null, action: false, selectSlot: null });
  });

  it("input from spectator is NOT forwarded to the host", () => {
    registry.handleControl(spectator, { type: "input", moveX: "right", moveY: null, action: false, selectSlot: null });
    expect(stub.controlLog).toHaveLength(0);
  });

  it("stop from spectator does NOT stop the shared run", () => {
    registry.handleControl(spectator, { type: "stop" });
    expect(stub.stopped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test suite 3 — late-join replay
// ---------------------------------------------------------------------------

describe("RunRegistry — late-join replay", () => {
  it("a late joiner receives the cached static-layer and patched snapshot", () => {
    const { registry } = makeRegistry();
    const init = makeInit();
    const first = new FakeSocket();

    // First socket creates the run.
    registry.attachInit(first, init);
    const stub = stubs[0]!;

    // Simulate the host emitting a static-layer then a snapshot.
    const staticMsg = makeStaticMsg();
    const snapMsg = makeSnapshotMsg(3);
    stub._send(staticMsg);
    stub._send(snapMsg);

    // Now a second socket attaches (late joiner).
    const late = new FakeSocket();
    registry.attachInit(late, init);

    // The late joiner should have received: attach, static-layer, snapshot (in that order).
    const parsed = late.sentParsed();
    expect(parsed[0]).toEqual({ type: "attach", owner: false });

    const staticReceived = parsed.find((m) => m.type === "static-layer");
    expect(staticReceived).toBeDefined();

    const snapReceived = parsed.find((m) => m.type === "snapshot");
    expect(snapReceived).toBeDefined();
    expect(snapReceived?.type).toBe("snapshot");

    // The snapshot's wealthSeries should be patched with lastWealthSeries (non-null).
    if (snapReceived?.type === "snapshot") {
      expect(snapReceived.snapshot.wealthSeries).toEqual(snapMsg.snapshot.wealthSeries);
    }
  });

  it("late-join replay does NOT call host.handleInbound(init) again", () => {
    const { registry } = makeRegistry();
    const init = makeInit();
    const first = new FakeSocket();
    const second = new FakeSocket();

    registry.attachInit(first, init);
    const stub = stubs[0]!;
    // After first attach, handleInbound should have been called once (with the init).
    expect(stub.inboundLog).toHaveLength(1);

    registry.attachInit(second, init);
    // Should still be 1 — second attach is replay-only, not a new sim start.
    expect(stub.inboundLog).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Test suite 4 — zero-socket reaping
// ---------------------------------------------------------------------------

describe("RunRegistry — zero-socket reaping", () => {
  it("detaching the last socket → host.stop() called after grace; run removed", async () => {
    vi.useFakeTimers();
    const { registry } = makeRegistry(100 /* reapGraceMs */);
    const socket = new FakeSocket();
    const init = makeInit();

    registry.attachInit(socket, init);
    expect(registry.runCount()).toBe(1);

    registry.detach(socket);
    // Not yet reaped (timer pending).
    expect(stubs[0]!.stopped).toBe(false);
    expect(registry.runCount()).toBe(1);

    vi.advanceTimersByTime(101);
    expect(stubs[0]!.stopped).toBe(true);
    expect(registry.runCount()).toBe(0);

    vi.useRealTimers();
  });

  it("attaching before grace fires cancels the reap", async () => {
    vi.useFakeTimers();
    const { registry } = makeRegistry(200);
    const a = new FakeSocket();
    const b = new FakeSocket();
    const init = makeInit();

    registry.attachInit(a, init);
    registry.detach(a);
    // Timer started but not fired yet.
    expect(stubs[0]!.stopped).toBe(false);

    // A new socket attaches before the grace period expires.
    registry.attachInit(b, init);

    // Advance past the original grace — timer should have been cancelled.
    vi.advanceTimersByTime(201);
    expect(stubs[0]!.stopped).toBe(false);
    expect(registry.runCount()).toBe(1);

    vi.useRealTimers();
  });

  it("owner-promotion: when owner leaves, next socket becomes owner and gets attach:true", () => {
    const { registry } = makeRegistry();
    const a = new FakeSocket();
    const b = new FakeSocket();
    const init = makeInit();

    registry.attachInit(a, init);
    registry.attachInit(b, init);

    // a is owner; detach a.
    registry.detach(a);

    // b should have received a fresh attach:true.
    const msgs = b.sentParsed();
    const attachMsgs = msgs.filter((m) => m.type === "attach");
    // First attach was owner:false, second should be owner:true.
    expect(attachMsgs).toHaveLength(2);
    expect(attachMsgs[0]).toEqual({ type: "attach", owner: false });
    expect(attachMsgs[1]).toEqual({ type: "attach", owner: true });
  });
});

// ---------------------------------------------------------------------------
// Test suite 5 — drop-stale: slow sockets skipped for snapshots
// ---------------------------------------------------------------------------

describe("RunRegistry — drop-stale", () => {
  it("snapshot not sent to socket with bufferedAmount > 1 MB", () => {
    const { registry } = makeRegistry();
    const init = makeInit();
    const fast = new FakeSocket();
    const slow = new FakeSocket();
    slow.bufferedAmount = 1_100_000; // over the 1 MB threshold

    registry.attachInit(fast, init);
    registry.attachInit(slow, init);

    const stub = stubs[0]!;
    stub._send(makeSnapshotMsg());

    // fast should have received the snapshot; slow should not.
    const fastMsgs = fast.sentParsed().filter((m) => m.type === "snapshot");
    const slowMsgs = slow.sentParsed().filter((m) => m.type === "snapshot");
    expect(fastMsgs).toHaveLength(1);
    expect(slowMsgs).toHaveLength(0);
  });

  it("static-layer is never dropped even if bufferedAmount > 1 MB", () => {
    const { registry } = makeRegistry();
    const init = makeInit();
    const slow = new FakeSocket();
    slow.bufferedAmount = 2_000_000;

    registry.attachInit(slow, init);
    const stub = stubs[0]!;
    stub._send(makeStaticMsg());

    const staticMsgs = slow.sentParsed().filter((m) => m.type === "static-layer");
    expect(staticMsgs).toHaveLength(1);
  });
});
