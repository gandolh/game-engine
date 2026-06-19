

import { describe, it, expect, beforeEach } from "vitest";
import {
  JuiceLayer,
  decayTrauma,
  traumaToDisplacement,
  easeOutCubic,
  easeOutBack,
  POPUP_POOL_SIZE,
  POPUP_KIND_CAP,
  MAX_SHAKE_PX,
} from "./juice";

import type { SnapshotEvent } from "@farm/sim-core/snapshot";
import { Camera2D } from "@engine/core";

function makeCamera(): Camera2D {
  return new Camera2D({
    worldUnitsX: 512,
    worldUnitsY: 512,
    centerX: 256,
    centerY: 256,
  });
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;

  Object.defineProperty(c, "clientWidth", { value: 512, configurable: true });
  Object.defineProperty(c, "clientHeight", { value: 512, configurable: true });
  return c;
}

function makeParent(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function tradeEvent(gold: number, drama = 0.1): SnapshotEvent {
  return {
    day: 1,
    text: `Alice bought 5 wheat from Bob (${gold}g)`,
    drama,
    farmerId: 2,
  };
}

function rankFlipEvent(drama = 0.75): SnapshotEvent {
  return {
    day: 5,
    text: "Alice overtakes Bob for 1st!",
    drama,
    farmerId: 1,
  };
}

function auctionEvent(drama = 0.55): SnapshotEvent {
  return {
    day: 3,
    text: "Carol won the golden bean at 120g",
    drama,
    farmerId: 3,
  };
}

function coralEvent(drama = 0.5): SnapshotEvent {
  return {
    day: 2,
    text: "Dave hauled in a coral-reef lobster (80g)!",
    drama,
    farmerId: 4,
  };
}

function contractDeliveredEvent(drama = 0.6): SnapshotEvent {
  return {
    day: 4,
    text: "Eve delivered a harbor contract — +200g, +10 rep",
    drama,
    farmerId: 5,
  };
}

function festivalEvent(drama = 0.7): SnapshotEvent {
  return {
    day: 10,
    text: "Harvest Fair — Alice wins with a Gold pumpkin",
    drama,
    farmerId: 1,
  };
}

function routineAcceptEvent(): SnapshotEvent {
  return {
    day: 1,
    text: "Bob accepted Alice's seed offer",
    drama: 0.15,
    farmerId: null,
  };
}

const EMPTY_MAP: ReadonlyMap<number, { x: number; y: number }> = new Map();

describe("easing math", () => {
  it("easeOutCubic(0) = 0, easeOutCubic(1) = 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("easeOutCubic is monotonically increasing", () => {
    let prev = 0;
    for (let i = 1; i <= 10; i++) {
      const v = easeOutCubic(i / 10);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it("easeOutBack(1) ≈ 1", () => {
    expect(easeOutBack(1)).toBeCloseTo(1, 5);
  });

  it("easeOutBack overshoots between 0 and 1 (> 1 at some midpoint)", () => {

    const values = [0.5, 0.6, 0.7, 0.8, 0.9].map(easeOutBack);

    expect(values.some((v) => v > 1)).toBe(true);
  });
});

describe("trauma decay", () => {
  it("decayTrauma reduces trauma by ~1/s", () => {
    expect(decayTrauma(1.0, 0.5)).toBeCloseTo(0.5, 5);
    expect(decayTrauma(0.5, 0.5)).toBeCloseTo(0.0, 5);
  });

  it("trauma clamps to 0 (never negative)", () => {
    expect(decayTrauma(0.1, 0.5)).toBe(0);
    expect(decayTrauma(0, 1)).toBe(0);
  });

  it("traumaToDisplacement is trauma²×MAX_SHAKE_PX", () => {
    expect(traumaToDisplacement(0)).toBe(0);
    expect(traumaToDisplacement(1)).toBeCloseTo(MAX_SHAKE_PX, 5);
    expect(traumaToDisplacement(0.5)).toBeCloseTo(0.25 * MAX_SHAKE_PX, 5);
  });

  it("MAX_SHAKE_PX ≤ 4 (cozy, not arcade)", () => {
    expect(MAX_SHAKE_PX).toBeLessThanOrEqual(4);
    expect(MAX_SHAKE_PX).toBeGreaterThanOrEqual(2);
  });
});

describe("JuiceLayer — popup pool cap", () => {
  let parent: HTMLElement;
  let layer: JuiceLayer;
  let camera: Camera2D;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    parent = makeParent();
    layer = new JuiceLayer(parent);
    camera = makeCamera();
    canvas = makeCanvas();
  });

  function countActivePopups(): number {

    const overlay = parent.firstChild as HTMLElement;
    let count = 0;
    for (const child of overlay.children) {
      const el = child as HTMLElement;
      if (el.style.display !== "none") count++;
    }
    return count;
  }

  it("pool has exactly POPUP_POOL_SIZE slots pre-allocated", () => {
    const overlay = parent.firstChild as HTMLElement;
    expect(overlay.children.length).toBe(POPUP_POOL_SIZE);
  });

  it("spawns a popup on a trade event (+gold)", () => {
    const events: SnapshotEvent[] = [tradeEvent(42)];
    layer.update(events, EMPTY_MAP, camera, canvas, 0.016);
    expect(countActivePopups()).toBe(1);
  });

  it("per-kind cap: gold events stop at POPUP_KIND_CAP.gold", () => {
    const cap = POPUP_KIND_CAP.gold;

    const events: SnapshotEvent[] = [];
    for (let i = 0; i < cap + 5; i++) {
      events.push(tradeEvent(10 + i));
    }
    layer.update(events, EMPTY_MAP, camera, canvas, 0.016);
    const overlay = parent.firstChild as HTMLElement;
    let goldCount = 0;
    for (const child of overlay.children) {
      const el = child as HTMLElement;
      if (el.style.display !== "none" && el.textContent?.includes("g")) goldCount++;
    }
    expect(goldCount).toBeLessThanOrEqual(cap);
  });

  it("total pool never exceeds POPUP_POOL_SIZE active popups", () => {

    const events: SnapshotEvent[] = [];
    for (let i = 0; i < POPUP_POOL_SIZE + 10; i++) {
      events.push(tradeEvent(10 + i));
    }
    layer.update(events, EMPTY_MAP, camera, canvas, 0.016);
    expect(countActivePopups()).toBeLessThanOrEqual(POPUP_POOL_SIZE);
  });

  it("no popup for routine accept events", () => {
    const events: SnapshotEvent[] = [routineAcceptEvent()];
    layer.update(events, EMPTY_MAP, camera, canvas, 0.016);
    expect(countActivePopups()).toBe(0);
  });

  it("popup spawns for contract-delivered (harbor payout)", () => {
    layer.update([contractDeliveredEvent()], EMPTY_MAP, camera, canvas, 0.016);
    expect(countActivePopups()).toBeGreaterThan(0);
  });

  it("popup spawns for coral catch", () => {
    layer.update([coralEvent()], EMPTY_MAP, camera, canvas, 0.016);
    expect(countActivePopups()).toBeGreaterThan(0);
  });

  it("popup spawns for festival win", () => {
    layer.update([festivalEvent()], EMPTY_MAP, camera, canvas, 0.016);
    expect(countActivePopups()).toBeGreaterThan(0);
  });

  it("popup spawns for auction win", () => {
    layer.update([auctionEvent()], EMPTY_MAP, camera, canvas, 0.016);
    expect(countActivePopups()).toBeGreaterThan(0);
  });
});

describe("JuiceLayer — resync / skip guard", () => {
  let parent: HTMLElement;
  let layer: JuiceLayer;
  let camera: Camera2D;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    parent = makeParent();
    layer = new JuiceLayer(parent);
    camera = makeCamera();
    canvas = makeCanvas();
  });

  function countActivePopups(): number {
    const overlay = parent.firstChild as HTMLElement;
    let count = 0;
    for (const child of overlay.children) {
      const el = child as HTMLElement;
      if (el.style.display !== "none") count++;
    }
    return count;
  }

  it("after signalResync, stale events do NOT spawn popups", () => {

    const events: SnapshotEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(tradeEvent(5 + i));
    }
    layer.signalResync();
    layer.update(events, EMPTY_MAP, camera, canvas, 0.016);

    expect(countActivePopups()).toBe(0);
  });

  it("after signalResync, NEW events arriving after resync DO spawn popups", () => {

    const staleBatch: SnapshotEvent[] = [];
    for (let i = 0; i < 5; i++) staleBatch.push(tradeEvent(i + 1));

    layer.signalResync();
    layer.update(staleBatch, EMPTY_MAP, camera, canvas, 0.016);
    expect(countActivePopups()).toBe(0);

    const newBatch = [...staleBatch, rankFlipEvent(), festivalEvent()];
    layer.update(newBatch, EMPTY_MAP, camera, canvas, 0.016);

    expect(countActivePopups()).toBeGreaterThan(0);
  });

  it("after signalResync, trauma is reset to zero", () => {

    const events: SnapshotEvent[] = [rankFlipEvent(), festivalEvent()];
    layer.update(events, EMPTY_MAP, camera, canvas, 0.016);

    layer.signalResync();
    layer.update(events, EMPTY_MAP, camera, canvas, 0.016);

    expect(layer.shake.x).toBe(0);
    expect(layer.shake.y).toBe(0);
  });

  it("events from before resync are never replayed even across multiple update calls", () => {
    const stale: SnapshotEvent[] = [tradeEvent(100), tradeEvent(200)];
    layer.signalResync();
    layer.update(stale, EMPTY_MAP, camera, canvas, 0.016);

    layer.update(stale, EMPTY_MAP, camera, canvas, 0.016);
    expect(countActivePopups()).toBe(0);
  });
});

describe("JuiceLayer — hitstop", () => {
  let parent: HTMLElement;
  let layer: JuiceLayer;
  let camera: Camera2D;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    parent = makeParent();
    layer = new JuiceLayer(parent);
    camera = makeCamera();
    canvas = makeCanvas();
  });

  it("rank-flip triggers hitstop (consumeHitstopFrames ≥ 2)", () => {
    layer.update([rankFlipEvent()], EMPTY_MAP, camera, canvas, 0.016);
    const frames = layer.consumeHitstopFrames();
    expect(frames).toBeGreaterThanOrEqual(2);
    expect(frames).toBeLessThanOrEqual(4);
  });

  it("auction win triggers hitstop", () => {
    layer.update([auctionEvent()], EMPTY_MAP, camera, canvas, 0.016);
    expect(layer.consumeHitstopFrames()).toBeGreaterThanOrEqual(1);
  });

  it("routine trade does NOT trigger hitstop", () => {
    layer.update([tradeEvent(12)], EMPTY_MAP, camera, canvas, 0.016);
    expect(layer.consumeHitstopFrames()).toBe(0);
  });

  it("hitstop frame count is within the cozy range (2–4 frames)", () => {
    layer.update([rankFlipEvent()], EMPTY_MAP, camera, canvas, 0.016);
    const frames = layer.consumeHitstopFrames();

    expect(frames).toBeGreaterThanOrEqual(2);
    expect(frames).toBeLessThanOrEqual(4);
  });

  it("consumeHitstopFrames resets to 0 after first call", () => {
    layer.update([rankFlipEvent()], EMPTY_MAP, camera, canvas, 0.016);
    layer.consumeHitstopFrames(); 
    expect(layer.consumeHitstopFrames()).toBe(0); 
  });
});

describe("JuiceLayer — shake on positive beats", () => {
  let parent: HTMLElement;
  let layer: JuiceLayer;
  let camera: Camera2D;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    parent = makeParent();
    layer = new JuiceLayer(parent);
    camera = makeCamera();
    canvas = makeCanvas();
  });

  it("rank-flip adds trauma (shake.x or shake.y non-zero after update)", () => {
    layer.update([rankFlipEvent()], EMPTY_MAP, camera, canvas, 0.016);

    const hasShake = Math.abs(layer.shake.x) > 0 || Math.abs(layer.shake.y) > 0;
    expect(hasShake).toBe(true);
  });

  it("shake displacement is within MAX_SHAKE_PX", () => {
    layer.update([rankFlipEvent(), festivalEvent(), coralEvent()], EMPTY_MAP, camera, canvas, 0.016);
    expect(Math.abs(layer.shake.x)).toBeLessThanOrEqual(MAX_SHAKE_PX + 0.001);
    expect(Math.abs(layer.shake.y)).toBeLessThanOrEqual(MAX_SHAKE_PX + 0.001);
  });

  it("routine trade does NOT add shake", () => {

    layer.update([tradeEvent(10, 0.1)], EMPTY_MAP, camera, canvas, 0.016);

    expect(layer.shake.x).toBe(0);
    expect(layer.shake.y).toBe(0);
  });
});

describe("JuiceLayer — drama-weighted intensity", () => {
  let parent: HTMLElement;
  let layer: JuiceLayer;
  let camera: Camera2D;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    parent = makeParent();
    layer = new JuiceLayer(parent);
    camera = makeCamera();
    canvas = makeCanvas();
  });

  it("high-drama popup has larger font than low-drama popup", () => {

    layer.update([tradeEvent(10, 0.0)], EMPTY_MAP, camera, canvas, 0.016);
    const overlay = parent.firstChild as HTMLElement;
    const lowEl = Array.from(overlay.children).find(
      (c) => (c as HTMLElement).style.display !== "none",
    ) as HTMLElement | undefined;
    const lowFont = lowEl ? parseInt(lowEl.style.fontSize, 10) : 0;

    layer.destroy();
    const parent2 = makeParent();
    const layer2 = new JuiceLayer(parent2);

    layer2.update([tradeEvent(100, 1.0)], EMPTY_MAP, camera, canvas, 0.016);
    const overlay2 = parent2.firstChild as HTMLElement;
    const highEl = Array.from(overlay2.children).find(
      (c) => (c as HTMLElement).style.display !== "none",
    ) as HTMLElement | undefined;
    const highFont = highEl ? parseInt(highEl.style.fontSize, 10) : 0;

    expect(highFont).toBeGreaterThan(lowFont);
    layer2.destroy();
  });
});
