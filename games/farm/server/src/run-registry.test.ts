
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RunRegistry } from "./run-registry";
import type { ClientSocket, MakeHostFn } from "./run-registry";
import type { SimInitMsg, SimOutbound, SimStaticLayerMsg, SimSnapshotMsg } from "@farm/sim-core/protocol";
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

  sentParsed(): SimOutbound[] {
    return this.sent.map((s) => JSON.parse(s) as SimOutbound);
  }

  lastParsed(): SimOutbound | undefined {
    const s = this.sent[this.sent.length - 1];
    return s !== undefined ? (JSON.parse(s) as SimOutbound) : undefined;
  }
}

class StubHost {
  stopped = false;
  inboundLog: SimInitMsg[] = [];
  controlLog: Array<SimOutbound | { type: string }> = [];

  _send: SendFn;

  constructor(send: SendFn) {
    this._send = send;
  }

  handleInbound(msg: SimInitMsg | { type: string }): void {
    if ((msg as SimInitMsg).type === "init") {
      this.inboundLog.push(msg as SimInitMsg);
    } else {
      this.controlLog.push(msg as SimOutbound);
    }
  }

  stop(): void {
    this.stopped = true;
  }
}

function makeInit(seed = 1, ticksPerDay = 20, maxDays = 5): SimInitMsg {
  return { type: "init", seed, ticksPerDay, maxDays, tickRateHz: 20 };
}

function makeStaticMsg(): SimStaticLayerMsg {
  return {
    type: "static-layer",
    sprites: [],
    worldWidthPx: 800,
    worldHeightPx: 600,
  };
}

function makeSnapshotMsg(day = 1): SimSnapshotMsg {
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
    } as unknown as SimSnapshotMsg["snapshot"],
  };
}

let stubs: StubHost[] = [];

function makeRegistry(
  reapGraceMs = 50,
  extra: { maxRuns?: number } = {},
): { registry: RunRegistry; stubs: StubHost[] } {
  stubs = [];
  const makeHost: MakeHostFn = (send, _init) => {
    const stub = new StubHost(send);
    stubs.push(stub);

    return stub as unknown as ReturnType<MakeHostFn>;
  };
  const registry = new RunRegistry(makeHost, { reapGraceMs, ...extra });
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
  it("a socket that re-inits has its previous run reaped IMMEDIATELY, not after the grace", () => {
    // CONTRACT CHANGE, audit-42: this used to arm the 10 s reap grace. The grace exists so a
    // GENUINELY DETACHED socket can reconnect and find its world still ticking — a socket that is
    // right here re-`init`ing is not coming back to the old run, and holding it (plus its tick
    // interval, plus a 21-farmer world) for another 10 s is what let an init loop mint runs faster
    // than the reaper could free them.
    vi.useFakeTimers();
    const { registry, stubs } = makeRegistry(100);
    const socket = new FakeSocket();

    registry.attachInit(socket, makeInit(1));
    const firstKey = registry.runKeyFor(makeInit(1));
    expect(registry.runCount()).toBe(1);

    registry.attachInit(socket, makeInit(2));
    const secondKey = registry.runKeyFor(makeInit(2));

    // No timer advance: the old run is already gone and its host already stopped.
    expect(registry.getRun(firstKey)).toBeUndefined();
    expect(stubs[0]!.stopped).toBe(true);
    expect(registry.getRun(secondKey)?.sockets.has(socket)).toBe(true);
    expect(registry.runCount()).toBe(1);

    vi.advanceTimersByTime(101);
    expect(registry.runCount()).toBe(1);
    expect(registry.getRun(secondKey)).toBeDefined();

    vi.useRealTimers();
  });

  it("re-init does NOT reap a run another socket is still attached to", () => {
    // The immediate reap must be scoped to an EMPTIED run — a shared run keeps ticking for the
    // peers left on it.
    vi.useFakeTimers();
    const { registry, stubs } = makeRegistry(100);
    const a = new FakeSocket();
    const b = new FakeSocket();

    registry.attachInit(a, makeInit(1));
    registry.attachInit(b, makeInit(1)); // same run key — both on run 1
    const firstKey = registry.runKeyFor(makeInit(1));
    expect(registry.getRun(firstKey)?.sockets.size).toBe(2);

    registry.attachInit(a, makeInit(2));

    expect(registry.getRun(firstKey)?.sockets.has(b)).toBe(true);
    expect(stubs[0]!.stopped).toBe(false);
    expect(registry.runCount()).toBe(2);

    vi.useRealTimers();
  });

  it("a genuinely detached socket still gets its full reconnect grace", () => {
    // The behaviour the grace was FOR — unchanged.
    vi.useFakeTimers();
    const { registry, stubs } = makeRegistry(100);
    const socket = new FakeSocket();

    registry.attachInit(socket, makeInit(1));
    const key = registry.runKeyFor(makeInit(1));

    registry.detach(socket); // socket closed, not re-initing

    expect(registry.getRun(key)).toBeDefined();
    expect(stubs[0]!.stopped).toBe(false);

    vi.advanceTimersByTime(101);
    expect(registry.getRun(key)).toBeUndefined();
    expect(stubs[0]!.stopped).toBe(true);

    vi.useRealTimers();
  });
});

describe("RunRegistry — concurrent-run cap (audit-42)", () => {
  it("refuses the run past the cap with a structured error and allocates no world", () => {
    const { registry, stubs } = makeRegistry(100, { maxRuns: 3 });
    const sockets = [new FakeSocket(), new FakeSocket(), new FakeSocket(), new FakeSocket()];

    for (let i = 0; i < 3; i++) {
      expect(registry.attachInit(sockets[i]!, makeInit(i + 1))).toBeNull();
    }
    expect(registry.runCount()).toBe(3);
    const hostsBefore = stubs.length;

    const refusal = registry.attachInit(sockets[3]!, makeInit(99));

    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe("run-limit");
    expect(registry.runCount()).toBe(3);
    // No half-built run left behind: no host was constructed, and the key is absent.
    expect(stubs.length).toBe(hostsBefore);
    expect(registry.getRun(registry.runKeyFor(makeInit(99)))).toBeUndefined();
  });

  it("an init LOOP with fresh clientIds cannot outgrow the cap", () => {
    // The actual attack (and the accidental N-tabs case): one socket, a new clientId each time.
    const { registry } = makeRegistry(100, { maxRuns: 3 });
    let refusals = 0;

    for (let i = 0; i < 50; i++) {
      const s = new FakeSocket();
      if (registry.attachInit(s, { ...makeInit(1), clientId: `c${String(i)}` }) !== null) refusals++;
    }

    expect(registry.runCount()).toBe(3);
    expect(refusals).toBe(47);
  });

  it("attaching to an EXISTING run is never refused, even at the cap", () => {
    // The cap counts worlds, not sockets — a spectator joining a live run costs nothing.
    const { registry } = makeRegistry(100, { maxRuns: 2 });
    const a = new FakeSocket();
    const b = new FakeSocket();
    const c = new FakeSocket();

    registry.attachInit(a, makeInit(1));
    registry.attachInit(b, makeInit(2));
    expect(registry.runCount()).toBe(2);

    expect(registry.attachInit(c, makeInit(1))).toBeNull();
    expect(registry.getRun(registry.runKeyFor(makeInit(1)))?.sockets.has(c)).toBe(true);
  });

  it("a refused socket frees its slot again once a run is reaped", () => {
    vi.useFakeTimers();
    const { registry } = makeRegistry(100, { maxRuns: 1 });
    const a = new FakeSocket();
    const b = new FakeSocket();

    registry.attachInit(a, makeInit(1));
    expect(registry.attachInit(b, makeInit(2))?.code).toBe("run-limit");

    registry.detach(a);
    vi.advanceTimersByTime(101);
    expect(registry.runCount()).toBe(0);

    expect(registry.attachInit(b, makeInit(2))).toBeNull();
    expect(registry.runCount()).toBe(1);

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
