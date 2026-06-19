

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SimClient } from "./client";
import type { RenderSnapshot, SnapshotSprite } from "@farm/sim-core/snapshot";

function makeSprite(id: number, x: number, y: number): SnapshotSprite {
  return {
    id,
    x,
    y,
    rotation: 0,
    layer: 0,
    frame: "farmer/down-0",
    alpha: 1,
    interpolate: true,
    action: null,
    label: null,
    description: null,
    facing: "down",
    flipX: false,
    bubble: null,
  };
}

function makeSnapshot(overrides: { tick?: number; sprites?: SnapshotSprite[] }): RenderSnapshot {
  return {
    tick: overrides.tick ?? 1,
    day: 1,
    sprites: overrides.sprites ?? [],
    meets: [],
    events: [],
    observer: {
      day: 1,
      season: "spring",
      farmers: [],
      weather: { condition: "normal", multiplier: 1 },
      forecast: [],
    },
    leaderboard: [],
    slate: [],
    entityCount: 0,
    shock: null,
    gameOver: false,
    finalSummary: null,
    recap: null,
    playerHotbar: null,
    playerInventory: null,
    relationships: { farmers: [], trust: {} },
    rivalries: [],
    wealthSeries: null,
    weather: { condition: "normal", season: "spring" },
    festival: null,
  };
}

type WsEventHandler = ((event: MessageEvent) => void) | null;

interface StubWs {
  onopen: (() => void) | null;
  onmessage: WsEventHandler;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close(): void;
  send(_data: string): void;

  deliver(data: unknown): void;
}

function makeStubWebSocket(): StubWs {
  const ws: StubWs = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    readyState: WebSocket.OPEN,
    close() { this.readyState = WebSocket.CLOSED; },
    send(_data: string) {  },
    deliver(data: unknown) {
      const event = new MessageEvent("message", { data: JSON.stringify(data) });
      this.onmessage?.(event);
    },
  };
  return ws;
}

function deliverSnapshot(ws: StubWs, snapshot: RenderSnapshot): void {
  ws.deliver({ type: "snapshot", snapshot });
}

function makeClient(): { client: SimClient; ws: StubWs } {
  const ws = makeStubWebSocket();
  vi.stubGlobal("WebSocket", function() { return ws; });
  const client = new SimClient("ws://test-stub");

  ws.onopen?.();
  return { client, ws };
}

describe("SimClient — brief 66 visibilitychange resync", () => {
  let nowMs = 1000;

  beforeEach(() => {
    nowMs = 1000;
    vi.stubGlobal("performance", { now: () => nowMs });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Case A: after hide→snapshots→visible, getInterpolatedSprites returns CURRENT positions (no lerp from pre-hidden prev)", () => {
    const { client, ws } = makeClient();

    const farmerIdA = 42;
    const snap0 = makeSnapshot({
      tick: 0,
      sprites: [makeSprite(farmerIdA, 10, 10)],
    });
    const snap1 = makeSnapshot({
      tick: 1,
      sprites: [makeSprite(farmerIdA, 20, 20)],
    });

    nowMs = 1000;
    deliverSnapshot(ws, snap0);
    nowMs = 1050;
    deliverSnapshot(ws, snap1);

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    const snap2 = makeSnapshot({
      tick: 2,
      sprites: [makeSprite(farmerIdA, 30, 30)],
    });
    const snap3 = makeSnapshot({
      tick: 3,
      sprites: [makeSprite(farmerIdA, 40, 40)],
    });
    const snap4 = makeSnapshot({
      tick: 4,
      sprites: [makeSprite(farmerIdA, 50, 50)],
    });

    nowMs = 1100;
    deliverSnapshot(ws, snap2);
    nowMs = 1150;
    deliverSnapshot(ws, snap3);
    nowMs = 1200;
    deliverSnapshot(ws, snap4);

    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });

    nowMs = 2000;
    document.dispatchEvent(new Event("visibilitychange"));

    const sprites = client.getInterpolatedSprites();

    const farmerSprite = sprites.find((s) => s.id === farmerIdA);
    expect(farmerSprite).toBeDefined();

    expect(farmerSprite!.x).toBe(50);
    expect(farmerSprite!.y).toBe(50);

    client.terminate();
  });

  it("Case B: after the first normal snapshot post-visible, interpolation resumes (sprite x strictly between prev and current)", () => {
    const { client, ws } = makeClient();

    const farmerIdB = 7;

    const snapBefore = makeSnapshot({
      tick: 0,
      sprites: [makeSprite(farmerIdB, 0, 0)],
    });
    nowMs = 1000;
    deliverSnapshot(ws, snapBefore);

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    const snapHidden = makeSnapshot({
      tick: 1,
      sprites: [makeSprite(farmerIdB, 100, 100)],
    });
    nowMs = 1500;
    deliverSnapshot(ws, snapHidden);

    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    nowMs = 2000;
    document.dispatchEvent(new Event("visibilitychange"));

    const snapPost = makeSnapshot({
      tick: 2,
      sprites: [makeSprite(farmerIdB, 120, 120)],
    });

    nowMs = 2010;
    deliverSnapshot(ws, snapPost);

    nowMs = 2135;

    const sprites = client.getInterpolatedSprites();
    const farmerSprite = sprites.find((s) => s.id === farmerIdB);

    expect(farmerSprite).toBeDefined();

    expect(farmerSprite!.x).toBeGreaterThan(100);
    expect(farmerSprite!.x).toBeLessThan(120);

    client.terminate();
  });
});

describe("SimClient — brief 82 teleport-distance clamp", () => {
  let nowMs = 1000;

  beforeEach(() => {
    nowMs = 1000;
    vi.stubGlobal("performance", { now: () => nowMs });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function lerpedX(prevX: number, curX: number): number {
    const { client, ws } = makeClient();
    const id = 5;

    nowMs = 1000;
    deliverSnapshot(ws, makeSnapshot({ tick: 0, sprites: [makeSprite(id, prevX, 0)] }));
    nowMs = 1050;
    deliverSnapshot(ws, makeSnapshot({ tick: 1, sprites: [makeSprite(id, curX, 0)] }));

    nowMs = 1175;
    const sprites = client.getInterpolatedSprites();
    const s = sprites.find((sp) => sp.id === id)!;
    const x = s.x;
    client.terminate();
    return x;
  }

  it("lerps a short hop (<= 2 tiles): a 1-tile (16px) step glides to the midpoint", () => {

    expect(lerpedX(100, 116)).toBeCloseTo(108, 5);
  });

  it("snaps a long jump (> 2 tiles): a travel-sized move skips the lerp and shows current", () => {

    expect(lerpedX(100, 300)).toBe(300);
  });

  it("lerps right at the 2-tile boundary (32px): still glides, not snapped", () => {

    expect(lerpedX(100, 132)).toBeCloseTo(116, 5);
  });
});
