

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

// Regression coverage for review item 15: render-loop.ts used to call
// getInterpolatedSprites() a second time (for hover) after already computing it once per frame.
// Each call decrements hitstopFramesLeft, so a caller invoking it twice per real animation frame
// burns through a requested hitstop in half the intended number of frames. These tests pin the
// per-call contract directly on SimClient: freezeInterp(n) must hold the same interpolated
// position across exactly n calls to getInterpolatedSprites(), and resume live interpolation on
// call n+1. render-loop.ts's fix (reusing the frame's already-computed sprite array for hover
// instead of recomputing it) is what keeps it to one call per frame.
describe("SimClient — freezeInterp holds for exactly the requested number of getInterpolatedSprites() calls", () => {
  let nowMs = 1000;

  beforeEach(() => {
    nowMs = 1000;
    vi.stubGlobal("performance", { now: () => nowMs });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("freezeInterp(2) yields the identical frozen position on 2 calls, then live interpolation on the 3rd", () => {
    const { client, ws } = makeClient();
    const id = 9;

    nowMs = 1000;
    deliverSnapshot(ws, makeSnapshot({ tick: 0, sprites: [makeSprite(id, 0, 0)] }));
    nowMs = 1050;
    deliverSnapshot(ws, makeSnapshot({ tick: 1, sprites: [makeSprite(id, 16, 0)] }));

    // Freeze mid-interpolation (alpha == 0.5 at this instant) for exactly 2 frames.
    nowMs = 1175;
    client.freezeInterp(2);

    // Time keeps moving after the freeze; a correct implementation still returns the alpha
    // captured at freeze time for the next 2 calls, regardless of wall-clock drift.
    nowMs = 1400;

    // getInterpolatedSprites() reuses (mutates) its output array across calls, so read the
    // primitive .x out immediately — holding onto the sprite object itself would silently observe
    // later calls' mutations instead of the value at this call.
    const x1 = client.getInterpolatedSprites().find((s) => s.id === id)!.x;
    const x2 = client.getInterpolatedSprites().find((s) => s.id === id)!.x;
    expect(x1).toBeCloseTo(8, 5);
    expect(x2).toBeCloseTo(8, 5);

    // 3rd call: the 2 requested hitstop frames are consumed, so this uses live alpha (now fully
    // advanced past the snapshot pair) — a different, non-frozen result.
    const x3 = client.getInterpolatedSprites().find((s) => s.id === id)!.x;
    expect(x3).toBe(16);
    expect(x3).not.toBeCloseTo(x1, 5);

    client.terminate();
  });

  it("a caller invoking getInterpolatedSprites() twice per frame burns the hitstop in half the requested frames (the item-15 bug, pinned to prove the contract)", () => {
    const { client, ws } = makeClient();
    const id = 3;

    nowMs = 1000;
    deliverSnapshot(ws, makeSnapshot({ tick: 0, sprites: [makeSprite(id, 0, 0)] }));
    nowMs = 1050;
    deliverSnapshot(ws, makeSnapshot({ tick: 1, sprites: [makeSprite(id, 16, 0)] }));

    nowMs = 1175;
    client.freezeInterp(2);
    nowMs = 1400;

    // Two calls within the same simulated "frame" (the pre-fix render-loop.ts pattern).
    client.getInterpolatedSprites();
    client.getInterpolatedSprites();

    // Both requested hitstop frames are already gone after a single real frame's worth of calls —
    // the 3rd call (which a correctly-fixed render-loop would treat as frame #2 of the hitstop)
    // instead sees live, fully-advanced interpolation.
    const s3 = client.getInterpolatedSprites().find((s) => s.id === id)!;
    expect(s3.x).toBe(16);

    client.terminate();
  });
});
