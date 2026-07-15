import { describe, it, expect, beforeEach } from "vitest";
import { FarmAudio, type AudioPlayer } from "./audio";
import { JuiceLayer } from "./juice";
import type { SnapshotEvent } from "@farm/sim-core/snapshot";
import { Camera2D } from "@engine/core";
import type { SoundSpec } from "@engine/core/audio";

/** Records `play()` calls instead of touching a real AudioContext (none exists under jsdom). */
class FakePlayer implements AudioPlayer {
  readonly registered = new Map<string, SoundSpec>();
  readonly played: string[] = [];
  muted = false;
  volume = 1;
  unlocked = false;

  register(id: string, spec: SoundSpec): void {
    this.registered.set(id, spec);
  }

  play(id: string): boolean {
    if (this.muted) return false;
    this.played.push(id);
    return true;
  }

  async unlock(): Promise<void> {
    this.unlocked = true;
  }
}

let nextTick = 1;

function tradeEvent(gold: number, tick = nextTick++): SnapshotEvent {
  return { tick, day: 1, text: `Alice bought 5 wheat from Bob (${gold}g)`, drama: 0.1, farmerId: 2 };
}

function rankFlipEvent(tick = nextTick++): SnapshotEvent {
  return { tick, day: 5, text: "Alice overtakes Bob for 1st!", drama: 0.75, farmerId: 1 };
}

function festivalEvent(tick = nextTick++): SnapshotEvent {
  return { tick, day: 10, text: "Harvest Fair — Alice wins with a Gold pumpkin", drama: 0.7, farmerId: 1 };
}

function droughtEvent(tick = nextTick++): SnapshotEvent {
  return { tick, day: 6, text: "Drought! Crops wilt across the valley.", drama: 0.5, farmerId: null };
}

function missedContractEvent(tick = nextTick++): SnapshotEvent {
  return { tick, day: 7, text: "Bob missed a harbor contract deadline", drama: 0.4, farmerId: 3 };
}

function routineEvent(tick = nextTick++): SnapshotEvent {
  return { tick, day: 1, text: "Bob accepted Alice's seed offer", drama: 0.15, farmerId: null };
}

describe("FarmAudio — event -> sound dispatch", () => {
  let fake: FakePlayer;
  let audio: FarmAudio;

  beforeEach(() => {
    fake = new FakePlayer();
    audio = new FarmAudio(fake);
  });

  it("registers exactly 3 sounds up front", () => {
    expect(fake.registered.size).toBe(3);
  });

  it("gold trade -> coin blip", () => {
    audio.onEvent(tradeEvent(42));
    expect(fake.played).toEqual(["farm.coin"]);
  });

  it("overtakes ... for 1st -> victory arpeggio", () => {
    audio.onEvent(rankFlipEvent());
    expect(fake.played).toEqual(["farm.victory"]);
  });

  it("wins with a ... -> victory arpeggio", () => {
    audio.onEvent(festivalEvent());
    expect(fake.played).toEqual(["farm.victory"]);
  });

  it("Drought! -> misfortune buzz", () => {
    audio.onEvent(droughtEvent());
    expect(fake.played).toEqual(["farm.misfortune"]);
  });

  it("missed a harbor contract -> misfortune buzz", () => {
    audio.onEvent(missedContractEvent());
    expect(fake.played).toEqual(["farm.misfortune"]);
  });

  it("routine (unmatched) event plays nothing", () => {
    audio.onEvent(routineEvent());
    expect(fake.played).toEqual([]);
  });

  it("muted engine plays nothing", () => {
    fake.muted = true;
    audio.muted = true;
    audio.onEvent(tradeEvent(10));
    expect(fake.played).toEqual([]);
  });

  it("unlock() delegates to the underlying engine", async () => {
    expect(fake.unlocked).toBe(false);
    await audio.unlock();
    expect(fake.unlocked).toBe(true);
  });
});

describe("JuiceLayer + FarmAudio — the resync/skip guarantee", () => {
  function makeCamera(): Camera2D {
    return new Camera2D({ worldUnitsX: 512, worldUnitsY: 512, centerX: 256, centerY: 256 });
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

  const EMPTY_MAP: ReadonlyMap<number, { x: number; y: number }> = new Map();

  it("a resync's stale backlog produces NO sound, even though it advances the high-water mark", () => {
    const fake = new FakePlayer();
    const audio = new FarmAudio(fake);
    const layer = new JuiceLayer(makeParent(), audio);
    const camera = makeCamera();
    const canvas = makeCanvas();

    // Simulate a burst of historical events arriving right after a resync (e.g. skip-to-highlight,
    // or tab refocus) — this is exactly the scenario the brief calls out: without the skip guard,
    // this whole backlog would replay as one burst of sound.
    const backlog: SnapshotEvent[] = [
      tradeEvent(10),
      rankFlipEvent(),
      droughtEvent(),
      festivalEvent(),
      missedContractEvent(),
    ];

    layer.signalResync();
    layer.update(backlog, EMPTY_MAP, camera, canvas, 0.016);

    expect(fake.played).toEqual([]);
  });

  it("events that arrive strictly after the resync's high-water mark DO play sound", () => {
    const fake = new FakePlayer();
    const audio = new FarmAudio(fake);
    const layer = new JuiceLayer(makeParent(), audio);
    const camera = makeCamera();
    const canvas = makeCanvas();

    const stale: SnapshotEvent[] = [tradeEvent(5), tradeEvent(6)];
    layer.signalResync();
    layer.update(stale, EMPTY_MAP, camera, canvas, 0.016);
    expect(fake.played).toEqual([]);

    const fresh = [...stale, rankFlipEvent()];
    layer.update(fresh, EMPTY_MAP, camera, canvas, 0.016);

    expect(fake.played).toEqual(["farm.victory"]);
  });

  it("without any audioSink injected, JuiceLayer still works (audio stays optional)", () => {
    const layer = new JuiceLayer(makeParent());
    const camera = makeCamera();
    const canvas = makeCanvas();
    expect(() => layer.update([rankFlipEvent()], EMPTY_MAP, camera, canvas, 0.016)).not.toThrow();
  });
});
