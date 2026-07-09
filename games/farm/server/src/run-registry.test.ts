
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RunRegistry } from "./run-registry";
import type { ClientSocket, MakeHostFn } from "./run-registry";
import type { WorkerInitMsg, WorkerOutbound, WorkerStaticLayerMsg, WorkerSnapshotMsg } from "@farm/sim-core/protocol";
import type { SendFn } from "./sim-host";

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

class StubHost {
  stopped = false;
  inboundLog: WorkerInitMsg[] = [];
  controlLog: Array<WorkerOutbound | { type: string }> = [];

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

    return stub as unknown as ReturnType<MakeHostFn>;
  };
  const registry = new RunRegistry(makeHost, { reapGraceMs });
  return { registry, stubs };
}

describe("RunRegistry — run sharing", () => {
  it("two attachInit with identical params → one run, one host; both sockets receive the same fan-out payload", () => {
    const { registry } = makeRegistry();
    const init = makeInit();
    const a = new FakeSocket();
    const b = new FakeSocket();

    registry.attachInit(a, init);
    registry.attachInit(b, init);

    expect(registry.runCount()).toBe(1);

    expect(stubs.length).toBe(1);

    const stub = stubs[0]!;
    const staticMsg = makeStaticMsg();
    stub._send(staticMsg);

    const lastA = a.sent[a.sent.length - 1];
    const lastB = b.sent[b.sent.length - 1];
    expect(lastA).toBeDefined();
    expect(lastB).toBeDefined();
    expect(lastA).toBe(lastB); 
  });

  it("same seed/params but distinct clientId → separate runs, each socket owns its own Pip", () => {
    const { registry } = makeRegistry();
    const a = new FakeSocket();
    const b = new FakeSocket();

    registry.attachInit(a, { ...makeInit(), clientId: "tab-a" });
    registry.attachInit(b, { ...makeInit(), clientId: "tab-b" });

    expect(registry.runCount()).toBe(2);
    expect(stubs.length).toBe(2);

    const attachA = JSON.parse(a.sent[0]!) as { type: string; owner: boolean };
    const attachB = JSON.parse(b.sent[0]!) as { type: string; owner: boolean };
    expect(attachA).toEqual({ type: "attach", owner: true });
    expect(attachB).toEqual({ type: "attach", owner: true });
  });

  it("two different run keys → two separate runs and hosts", () => {
    const { registry } = makeRegistry();
    const a = new FakeSocket();
    const b = new FakeSocket();

    registry.attachInit(a, makeInit(1));
    registry.attachInit(b, makeInit(2)); 

    expect(registry.runCount()).toBe(2);
    expect(stubs.length).toBe(2);
  });
});

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

describe("RunRegistry — late-join replay", () => {
  it("a late joiner receives the cached static-layer and patched snapshot", () => {
    const { registry } = makeRegistry();
    const init = makeInit();
    const first = new FakeSocket();

    registry.attachInit(first, init);
    const stub = stubs[0]!;

    const staticMsg = makeStaticMsg();
    const snapMsg = makeSnapshotMsg(3);
    stub._send(staticMsg);
    stub._send(snapMsg);

    const late = new FakeSocket();
    registry.attachInit(late, init);

    const parsed = late.sentParsed();
    expect(parsed[0]).toEqual({ type: "attach", owner: false });

    const staticReceived = parsed.find((m) => m.type === "static-layer");
    expect(staticReceived).toBeDefined();

    const snapReceived = parsed.find((m) => m.type === "snapshot");
    expect(snapReceived).toBeDefined();
    expect(snapReceived?.type).toBe("snapshot");

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

    expect(stub.inboundLog).toHaveLength(1);

    registry.attachInit(second, init);

    expect(stub.inboundLog).toHaveLength(1);
  });
});

describe("RunRegistry — zero-socket reaping", () => {
  it("detaching the last socket → host.stop() called after grace; run removed", async () => {
    vi.useFakeTimers();
    const { registry } = makeRegistry(100 );
    const socket = new FakeSocket();
    const init = makeInit();

    registry.attachInit(socket, init);
    expect(registry.runCount()).toBe(1);

    registry.detach(socket);

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

    expect(stubs[0]!.stopped).toBe(false);

    registry.attachInit(b, init);

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

    registry.detach(a);

    const msgs = b.sentParsed();
    const attachMsgs = msgs.filter((m) => m.type === "attach");

    expect(attachMsgs).toHaveLength(2);
    expect(attachMsgs[0]).toEqual({ type: "attach", owner: false });
    expect(attachMsgs[1]).toEqual({ type: "attach", owner: true });
  });
});

describe("RunRegistry — double-init on one socket", () => {
  it("a socket that inits a second, different run-key is detached from the first run, which then reaps", () => {
    vi.useFakeTimers();
    const { registry, stubs } = makeRegistry(100);
    const socket = new FakeSocket();

    registry.attachInit(socket, makeInit(1));
    const firstKey = registry.runKeyFor(makeInit(1));
    expect(registry.runCount()).toBe(1);
    expect(registry.getRun(firstKey)?.sockets.has(socket)).toBe(true);

    registry.attachInit(socket, makeInit(2));
    const secondKey = registry.runKeyFor(makeInit(2));

    expect(registry.getRun(firstKey)?.sockets.has(socket)).toBe(false);
    expect(registry.getRun(secondKey)?.sockets.has(socket)).toBe(true);
    expect(registry.runCount()).toBe(2);
    expect(stubs[0]!.stopped).toBe(false);

    vi.advanceTimersByTime(101);

    expect(registry.runCount()).toBe(1);
    expect(stubs[0]!.stopped).toBe(true);
    expect(registry.getRun(secondKey)).toBeDefined();

    vi.useRealTimers();
  });
});

describe("RunRegistry — drop-stale", () => {
  it("snapshot not sent to socket with bufferedAmount > 1 MB", () => {
    const { registry } = makeRegistry();
    const init = makeInit();
    const fast = new FakeSocket();
    const slow = new FakeSocket();
    slow.bufferedAmount = 1_100_000; 

    registry.attachInit(fast, init);
    registry.attachInit(slow, init);

    const stub = stubs[0]!;
    stub._send(makeSnapshotMsg());

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
