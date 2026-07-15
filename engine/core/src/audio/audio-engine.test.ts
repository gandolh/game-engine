import { describe, expect, it } from "vitest";
import { AudioEngine } from "./audio-engine";
import type { AudioContextLike } from "./types";

// The fakes below model only the Web Audio surface `AudioContextLike` exposes; each is cast to the
// DOM type it stands in for (the node test env has no Web Audio implementation, only the types).

class FakeParam {
  value = 0;
  readonly events: Array<{ kind: string; value: number; time: number }> = [];

  setValueAtTime(value: number, time: number): FakeParam {
    this.value = value;
    this.events.push({ kind: "setValueAtTime", value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): FakeParam {
    this.events.push({ kind: "linearRamp", value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): FakeParam {
    this.events.push({ kind: "exponentialRamp", value, time });
    return this;
  }
}

class FakeNode {
  readonly connectedTo: FakeNode[] = [];
  disconnected = false;

  connect(dest: FakeNode): FakeNode {
    this.connectedTo.push(dest);
    return dest;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = "sine";
  readonly frequency = new FakeParam();
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;

  start(when: number): void {
    this.started = when;
  }

  stop(when: number): void {
    this.stopped = when;
  }
}

class FakeBufferSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  readonly playbackRate = new FakeParam();
  started: number | null = null;
  onended: (() => void) | null = null;

  start(when: number): void {
    this.started = when;
  }

  stop(): void {}
}

class FakeAudioContext implements AudioContextLike {
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  readonly destination = new FakeNode() as unknown as AudioNode;
  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];
  readonly bufferSources: FakeBufferSource[] = [];
  resumeCalls = 0;

  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = "running";
  }

  createGain(): GainNode {
    const g = new FakeGain();
    this.gains.push(g);
    return g as unknown as GainNode;
  }

  createOscillator(): OscillatorNode {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o as unknown as OscillatorNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const s = new FakeBufferSource();
    this.bufferSources.push(s);
    return s as unknown as AudioBufferSourceNode;
  }

  /** The master gain is the first gain the engine creates. */
  get master(): FakeGain {
    const m = this.gains[0];
    if (m === undefined) throw new Error("no master gain created");
    return m;
  }
}

function runningCtx(): FakeAudioContext {
  const ctx = new FakeAudioContext();
  ctx.state = "running";
  return ctx;
}

function engineWith(
  ctx: FakeAudioContext,
  opts?: { masterVolume?: number; maxVoices?: number },
): AudioEngine {
  return new AudioEngine({ contextFactory: () => ctx, ...opts });
}

const BLIP = { kind: "synth", osc: "square", freq: 440, durationMs: 80, gain: 0.5 } as const;

describe("AudioEngine", () => {
  it("wires the master gain to the destination at construction", () => {
    const ctx = runningCtx();
    engineWith(ctx);
    expect(ctx.gains).toHaveLength(1);
    expect(ctx.master.connectedTo).toEqual([ctx.destination]);
  });

  it("register -> play routes a source through a voice gain into the master gain", () => {
    const ctx = runningCtx();
    const audio = engineWith(ctx);
    audio.register("blip", BLIP);

    expect(audio.play("blip")).toBe(true);
    expect(ctx.oscillators).toHaveLength(1);

    const osc = ctx.oscillators[0];
    const voiceGain = ctx.gains[1];
    if (osc === undefined || voiceGain === undefined) throw new Error("no voice built");

    expect(osc.type).toBe("square");
    expect(osc.frequency.value).toBe(440);
    expect(osc.started).toBe(0);
    expect(osc.stopped).toBeCloseTo(0.08);
    expect(osc.connectedTo).toEqual([voiceGain]);
    expect(voiceGain.connectedTo).toEqual([ctx.master]);
    expect(voiceGain.gain.value).toBeCloseTo(0.5);
  });

  it("applies sweepToFreq, arpeggio and pitch to the oscillator", () => {
    const ctx = runningCtx();
    const audio = engineWith(ctx);
    audio.register("sweep", { kind: "synth", osc: "sine", freq: 200, durationMs: 100, sweepToFreq: 400 });
    audio.register("arp", { kind: "synth", osc: "triangle", freq: 300, durationMs: 90, arpeggio: [300, 400, 500] });

    audio.play("sweep", { pitch: 2 });
    audio.play("arp");

    const sweep = ctx.oscillators[0];
    const arp = ctx.oscillators[1];
    if (sweep === undefined || arp === undefined) throw new Error("no voices built");

    expect(sweep.frequency.events).toContainEqual({ kind: "linearRamp", value: 800, time: 0.1 });
    expect(arp.frequency.events.filter((e) => e.kind === "setValueAtTime").map((e) => e.value)).toEqual([
      300, 300, 400, 500,
    ]);
  });

  it("plays a buffer spec through an AudioBufferSourceNode", () => {
    const ctx = runningCtx();
    const audio = engineWith(ctx);
    // Only `duration` is read (to schedule the voice's lifetime).
    const buffer = { duration: 0.25 } as unknown as AudioBuffer;
    audio.register("sample", { kind: "buffer", buffer });

    expect(audio.play("sample")).toBe(true);
    const src = ctx.bufferSources[0];
    const voiceGain = ctx.gains[1];
    if (src === undefined || voiceGain === undefined) throw new Error("no voice built");
    expect(src.buffer).toBe(buffer);
    expect(src.started).toBe(0);
    expect(src.connectedTo).toEqual([voiceGain]);
    expect(voiceGain.connectedTo).toEqual([ctx.master]);
  });

  it("muted => play returns false and creates no source", () => {
    const ctx = runningCtx();
    const audio = engineWith(ctx);
    audio.register("blip", BLIP);
    audio.muted = true;

    expect(audio.play("blip")).toBe(false);
    expect(ctx.oscillators).toHaveLength(0);
    expect(ctx.master.gain.value).toBe(0);

    audio.muted = false;
    expect(ctx.master.gain.value).toBe(1);
    expect(audio.play("blip")).toBe(true);
  });

  it("volume scales the master gain and clamps to 0..1", () => {
    const ctx = runningCtx();
    const audio = engineWith(ctx, { masterVolume: 0.4 });
    expect(ctx.master.gain.value).toBeCloseTo(0.4);

    audio.volume = 0.75;
    expect(audio.volume).toBeCloseTo(0.75);
    expect(ctx.master.gain.value).toBeCloseTo(0.75);

    audio.volume = 5;
    expect(audio.volume).toBe(1);
    audio.volume = -2;
    expect(audio.volume).toBe(0);
    expect(ctx.master.gain.value).toBe(0);
  });

  it("enforces the voice cap and frees the slot when a voice ends", () => {
    const ctx = runningCtx();
    const audio = engineWith(ctx, { maxVoices: 3 });
    audio.register("blip", BLIP);

    expect(audio.play("blip")).toBe(true);
    expect(audio.play("blip")).toBe(true);
    expect(audio.play("blip")).toBe(true);
    expect(audio.play("blip")).toBe(false);
    expect(ctx.oscillators).toHaveLength(3);

    // a finished voice frees its slot via onended
    const first = ctx.oscillators[0];
    if (first === undefined) throw new Error("no voice built");
    first.onended?.();
    expect(first.disconnected).toBe(true);

    expect(audio.play("blip")).toBe(true);
    expect(ctx.oscillators).toHaveLength(4);
  });

  it("reaps voices past their scheduled end even if onended never fires", () => {
    const ctx = runningCtx();
    const audio = engineWith(ctx, { maxVoices: 2 });
    audio.register("blip", BLIP); // 80ms

    expect(audio.play("blip")).toBe(true);
    expect(audio.play("blip")).toBe(true);
    expect(audio.play("blip")).toBe(false);

    ctx.currentTime = 1; // both voices are long finished
    expect(audio.play("blip")).toBe(true);
  });

  it("pre-unlock play is a safe no-op; unlock() drives the context to running", async () => {
    const ctx = new FakeAudioContext(); // suspended, as a browser hands it over
    const audio = engineWith(ctx);
    audio.register("blip", BLIP);

    expect(audio.unlocked).toBe(false);
    expect(audio.play("blip")).toBe(false);
    expect(ctx.oscillators).toHaveLength(0);

    await audio.unlock();
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.state).toBe("running");
    expect(audio.unlocked).toBe(true);
    expect(audio.play("blip")).toBe(true);

    await audio.unlock(); // already running — no redundant resume
    expect(ctx.resumeCalls).toBe(1);
  });

  it("unknown id => play returns false without throwing", () => {
    const ctx = runningCtx();
    const audio = engineWith(ctx);
    expect(audio.play("nope")).toBe(false);
    expect(ctx.oscillators).toHaveLength(0);
  });

  it("degrades to a silent stub with no Web Audio (node/jsdom)", async () => {
    expect((globalThis as { AudioContext?: unknown }).AudioContext).toBeUndefined();

    const audio = new AudioEngine();
    audio.register("blip", BLIP);
    expect(audio.unlocked).toBe(false);
    expect(audio.play("blip")).toBe(false);
    await expect(audio.unlock()).resolves.toBeUndefined();

    audio.volume = 0.5;
    audio.muted = true;
    expect(audio.volume).toBe(0.5);
    expect(audio.muted).toBe(true);
  });

  it("degrades to a silent stub when the context factory throws", () => {
    const audio = new AudioEngine({
      contextFactory: () => {
        throw new Error("AudioContext refused");
      },
    });
    audio.register("blip", BLIP);
    expect(audio.play("blip")).toBe(false);
  });
});
