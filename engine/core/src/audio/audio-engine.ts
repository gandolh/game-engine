import type {
  AudioContextLike,
  AudioEngineOptions,
  PlayOptions,
  SoundSpec,
} from "./types";

/** Floor for exponential ramps — Web Audio rejects a target of exactly 0. */
const SILENCE = 0.0001;

const DEFAULT_MAX_VOICES = 16;

interface Voice {
  readonly source: AudioScheduledSourceNode;
  readonly gain: GainNode;
  /** Context time the voice is scheduled to finish at; used to reap voices whose `onended` never fires. */
  readonly endsAt: number;
}

/**
 * Feature-detect Web Audio. Node and jsdom have none, so we return null and the engine
 * degrades to a silent stub rather than throwing at construction.
 */
function createDefaultContext(): AudioContextLike | null {
  const g = globalThis as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (Ctor === undefined) return null;
  return new Ctor();
}

function clamp01(v: number): number {
  if (!(v > 0)) return 0;
  return v > 1 ? 1 : v;
}

/**
 * Generic sound player: per-voice source → per-voice gain → master gain → destination.
 *
 * Browsers create an AudioContext **suspended** until a user gesture, so `play()` before
 * `unlock()` is a safe no-op returning false (it never throws and never builds a node).
 */
export class AudioEngine {
  private readonly _ctx: AudioContextLike | null;
  private readonly _master: GainNode | null;
  private readonly _sounds = new Map<string, SoundSpec>();
  private readonly _voices: Voice[] = [];
  private readonly _maxVoices: number;

  private _volume: number;
  private _muted = false;

  constructor(opts?: AudioEngineOptions) {
    this._volume = clamp01(opts?.masterVolume ?? 1);
    this._maxVoices = opts?.maxVoices ?? DEFAULT_MAX_VOICES;

    let ctx: AudioContextLike | null = null;
    try {
      ctx = opts?.contextFactory !== undefined ? opts.contextFactory() : createDefaultContext();
    } catch {
      ctx = null; // no Web Audio (or the ctor refused) — stay silent instead of failing the client
    }
    this._ctx = ctx;

    if (ctx === null) {
      this._master = null;
    } else {
      this._master = ctx.createGain();
      this._master.connect(ctx.destination);
      this._applyMasterGain();
    }
  }

  register(id: string, spec: SoundSpec): void {
    this._sounds.set(id, spec);
  }

  /** @returns false when muted, still locked, voice-saturated, or the id is unknown. */
  play(id: string, opts?: PlayOptions): boolean {
    const ctx = this._ctx;
    const master = this._master;
    if (ctx === null || master === null) return false;
    if (this._muted) return false;
    if (ctx.state !== "running") return false; // pre-unlock: build nothing

    const spec = this._sounds.get(id);
    if (spec === undefined) return false;

    this._reapVoices();
    if (this._voices.length >= this._maxVoices) return false;

    const pitch = opts?.pitch ?? 1;
    const now = ctx.currentTime;
    const voiceGain = ctx.createGain();

    const voice =
      spec.kind === "synth"
        ? this._buildSynth(ctx, spec, voiceGain, now, pitch, opts?.gain ?? 1)
        : this._buildBuffer(ctx, spec, voiceGain, now, pitch, opts?.gain ?? 1);

    voiceGain.connect(master);
    voice.source.onended = () => this._retire(voice);
    this._voices.push(voice);
    return true;
  }

  /** Resume a suspended context. Clients must call this from a real user gesture. */
  async unlock(): Promise<void> {
    const ctx = this._ctx;
    if (ctx === null) return;
    if (ctx.state !== "suspended") return;
    await ctx.resume();
  }

  get unlocked(): boolean {
    return this._ctx !== null && this._ctx.state === "running";
  }

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = clamp01(v);
    this._applyMasterGain();
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(m: boolean) {
    this._muted = m;
    this._applyMasterGain();
  }

  private _buildSynth(
    ctx: AudioContextLike,
    spec: Extract<SoundSpec, { kind: "synth" }>,
    voiceGain: GainNode,
    now: number,
    pitch: number,
    gainScale: number,
  ): Voice {
    const durSec = Math.max(0, spec.durationMs) / 1000;
    const osc = ctx.createOscillator();
    osc.type = spec.osc;
    osc.frequency.setValueAtTime(spec.freq * pitch, now);

    const steps = spec.arpeggio;
    if (steps !== undefined && steps.length > 0) {
      const slice = durSec / steps.length;
      for (let i = 0; i < steps.length; i++) {
        const f = steps[i];
        if (f !== undefined) osc.frequency.setValueAtTime(f * pitch, now + i * slice);
      }
    } else if (spec.sweepToFreq !== undefined) {
      osc.frequency.linearRampToValueAtTime(spec.sweepToFreq * pitch, now + durSec);
    }

    const peak = Math.max(SILENCE, clamp01((spec.gain ?? 1) * gainScale));
    voiceGain.gain.setValueAtTime(peak, now);
    voiceGain.gain.exponentialRampToValueAtTime(SILENCE, now + durSec); // decay to avoid an end-of-voice click

    osc.connect(voiceGain);
    osc.start(now);
    osc.stop(now + durSec);
    return { source: osc, gain: voiceGain, endsAt: now + durSec };
  }

  private _buildBuffer(
    ctx: AudioContextLike,
    spec: Extract<SoundSpec, { kind: "buffer" }>,
    voiceGain: GainNode,
    now: number,
    pitch: number,
    gainScale: number,
  ): Voice {
    const rate = pitch > 0 ? pitch : 1; // rate 0 would stall the source forever (onended never fires)
    const src = ctx.createBufferSource();
    src.buffer = spec.buffer;
    src.playbackRate.setValueAtTime(rate, now);

    voiceGain.gain.setValueAtTime(Math.max(SILENCE, clamp01(gainScale)), now);

    src.connect(voiceGain);
    src.start(now);
    const durSec = spec.buffer.duration / rate;
    return { source: src, gain: voiceGain, endsAt: now + durSec };
  }

  private _applyMasterGain(): void {
    if (this._master === null) return;
    this._master.gain.value = this._muted ? 0 : this._volume;
  }

  /** Safety net: a context that never fires `onended` (suspended, closed, stubbed) must not leak voices. */
  private _reapVoices(): void {
    const ctx = this._ctx;
    if (ctx === null) return;
    for (let i = this._voices.length - 1; i >= 0; i--) {
      const v = this._voices[i];
      if (v !== undefined && v.endsAt <= ctx.currentTime) {
        this._disconnect(v);
        this._voices.splice(i, 1);
      }
    }
  }

  private _retire(voice: Voice): void {
    const i = this._voices.indexOf(voice);
    if (i < 0) return;
    this._voices.splice(i, 1);
    this._disconnect(voice);
  }

  private _disconnect(voice: Voice): void {
    try {
      voice.source.disconnect();
      voice.gain.disconnect();
    } catch {
      // already torn down by the context — nothing to do
    }
  }
}
