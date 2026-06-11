/**
 * client.visibility.test.ts — brief 66 — jsdom tests for the visibilitychange
 * resync logic in SimClient.
 *
 * Runs in the jsdom vitest project (listed in vitest.config.ts DOM_FILES).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SimClient } from "./client";
import type { RenderSnapshot, SnapshotSprite } from "@farm/sim-core/snapshot";

// ---------------------------------------------------------------------------
// Minimal RenderSnapshot factory — only the fields SimClient actually reads.
// ---------------------------------------------------------------------------

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
    relationships: { farmers: [], trust: {} },
    rivalries: [],
    wealthSeries: null,
    weather: { condition: "normal", season: "spring" },
    festival: null,
  };
}

// ---------------------------------------------------------------------------
// Minimal WebSocket stub — synchronous, no real network.
// ---------------------------------------------------------------------------

type WsEventHandler = ((event: MessageEvent) => void) | null;

interface StubWs {
  onopen: (() => void) | null;
  onmessage: WsEventHandler;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close(): void;
  send(_data: string): void;
  /** Fire a message frame (as the server would). */
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
    send(_data: string) { /* no-op */ },
    deliver(data: unknown) {
      const event = new MessageEvent("message", { data: JSON.stringify(data) });
      this.onmessage?.(event);
    },
  };
  return ws;
}

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

/** Send a snapshot frame through the stub socket. */
function deliverSnapshot(ws: StubWs, snapshot: RenderSnapshot): void {
  ws.deliver({ type: "snapshot", snapshot });
}

/**
 * Construct a SimClient backed by the stub socket.
 * Returns the client and the stub so tests can drive messages.
 */
function makeClient(): { client: SimClient; ws: StubWs } {
  const ws = makeStubWebSocket();
  vi.stubGlobal("WebSocket", function() { return ws; });
  const client = new SimClient("ws://test-stub");
  // Simulate the socket opening so sendMsg goes through (not strictly required
  // for snapshot delivery, but realistic).
  ws.onopen?.();
  return { client, ws };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Case A — no lerp from a pre-hidden sprite after tab returns
  // -------------------------------------------------------------------------
  it("Case A: after hide→snapshots→visible, getInterpolatedSprites returns CURRENT positions (no lerp from pre-hidden prev)", () => {
    const { client, ws } = makeClient();

    // Deliver two snapshots before hiding so there is a live prev/current pair.
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

    // -- Tab hides --
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    // Deliver 3 backlogged snapshots while hidden (simulating a burst of server traffic).
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

    // -- Tab becomes visible again --
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    // Set now to the moment of becoming visible so lastSnapshotArrivalMs is reset.
    nowMs = 2000;
    document.dispatchEvent(new Event("visibilitychange"));

    // Call getInterpolatedSprites at now=2000 (right after visible event).
    // With prevSnapshot null, alpha=0 path → sprites snap to current positions.
    const sprites = client.getInterpolatedSprites();

    // The latest snapshot was snap4 (x=50, y=50 for farmer 42).
    const farmerSprite = sprites.find((s) => s.id === farmerIdA);
    expect(farmerSprite).toBeDefined();

    // prevSnapshot is null → no lerp; sprite should be exactly at current (snap4) position.
    expect(farmerSprite!.x).toBe(50);
    expect(farmerSprite!.y).toBe(50);

    client.terminate();
  });

  // -------------------------------------------------------------------------
  // Case B — interpolation resumes after one normal snapshot follows re-show
  // -------------------------------------------------------------------------
  it("Case B: after the first normal snapshot post-visible, interpolation resumes (sprite x strictly between prev and current)", () => {
    const { client, ws } = makeClient();

    const farmerIdB = 7;

    // -- Setup: hide, deliver snapshots, re-show (same as Case A) --
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

    // Re-show — onVisibilityChange sets lastSnapshotArrivalMs = performance.now() = 2000.
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    nowMs = 2000;
    document.dispatchEvent(new Event("visibilitychange"));

    // Deliver one fresh snapshot while visible. This becomes current; the old
    // hidden snapshot becomes prev (snap at x=100 → x=200). prevById is rebuilt.
    // After this delivery prevSnapshot = snap at x=100, currentSnapshot = snap at x=200.
    const snapPost = makeSnapshot({
      tick: 2,
      sprites: [makeSprite(farmerIdB, 200, 200)],
    });
    // Deliver it slightly after re-show so arrival timestamp is set.
    nowMs = 2010;
    deliverSnapshot(ws, snapPost);

    // msPerTick defaults to 50 ms; renderDelayMs = 2 * 50 = 100 ms.
    // To get alpha in the interpolation window (0 < alpha < 1), advance time so
    // (now - lastSnapshotArrivalMs - renderDelayMs) / msPerTick is between 0 and 1.
    // lastSnapshotArrivalMs was set to 2010 by the snapshot delivery.
    // Choose now = 2010 + 100 + 25 = 2135 → rawAlpha = 25/50 = 0.5 → smoothstep(0.5) = 0.5.
    nowMs = 2135;

    const sprites = client.getInterpolatedSprites();
    const farmerSprite = sprites.find((s) => s.id === farmerIdB);

    expect(farmerSprite).toBeDefined();

    // prevSprite.x = 100, currentSprite.x = 200, alpha = smoothstep(0.5) = 0.5.
    // lerp(100, 200, 0.5) = 150.
    // It just needs to be strictly between prev and current (not snapped to either).
    expect(farmerSprite!.x).toBeGreaterThan(100);
    expect(farmerSprite!.x).toBeLessThan(200);

    client.terminate();
  });
});
