/**
 * Citadel's 3-sound test palette for the engine audio subsystem (brief 19, Chunk C) — a
 * client/render concern only, never touched from sim-core. Wraps `@engine/core/audio`'s
 * `AudioEngine` and maps each freshly-appended event message to one of 3 procedural
 * (zero-asset) synth blips, keyed off `toneOf` (the SAME tone classification `toast.ts`
 * uses for its label colour) rather than re-guessing at event strings — tone reuse
 * guarantees audio and toasts never disagree about what counts as "danger"/"good"/"neutral".
 */
import { AudioEngine, type SoundSpec } from "@engine/core/audio";
import { toneOf } from "./toast";

const SOUND_ALARM = "citadel.alarm";
const SOUND_CHIME = "citadel.chime";
const SOUND_TICK = "citadel.tick";

/**
 * The narrow `AudioEngine` surface `CitadelAudio` needs. An interface (rather than the
 * concrete class) so tests can substitute a recording fake without standing up a real
 * `AudioContext` — a plain object literal can satisfy this shape, but not a class with
 * private fields.
 */
export interface AudioPlayer {
  register(id: string, spec: SoundSpec): void;
  play(id: string, opts?: { gain?: number; pitch?: number }): boolean;
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  volume: number;
  muted: boolean;
}

export class CitadelAudio {
  private readonly engine: AudioPlayer;

  constructor(engine: AudioPlayer = new AudioEngine()) {
    this.engine = engine;

    // Alarm pulse — urgent square-wave down-sweep for danger events (fire/raid/disease/breach…).
    this.engine.register(SOUND_ALARM, {
      kind: "synth",
      osc: "square",
      freq: 660,
      durationMs: 260,
      gain: 0.55,
      sweepToFreq: 220,
    });

    // Chime — bright triangle arpeggio for good events (promotions/harvests/trade…).
    this.engine.register(SOUND_CHIME, {
      kind: "synth",
      osc: "triangle",
      freq: 523,
      durationMs: 300,
      gain: 0.5,
      arpeggio: [523, 659, 784],
    });

    // Soft tick — quiet short sine blip for warn/info events (the neutral default).
    this.engine.register(SOUND_TICK, {
      kind: "synth",
      osc: "sine",
      freq: 392,
      durationMs: 90,
      gain: 0.3,
    });
  }

  /** Resume the (browser-suspended) audio context. Call from a real user gesture. */
  unlock(): Promise<void> {
    return this.engine.unlock();
  }

  get muted(): boolean {
    return this.engine.muted;
  }

  set muted(m: boolean) {
    this.engine.muted = m;
  }

  /** Feed one freshly-appended event message (from `newEventsSince`); plays a sound per its tone. */
  onEvent(msg: string): void {
    const tone = toneOf(msg);
    if (tone === "danger") {
      this.engine.play(SOUND_ALARM);
    } else if (tone === "good") {
      this.engine.play(SOUND_CHIME);
    } else {
      // "warn" and "info" share the soft tick (brief 19: 2 distinct sounds cover 4 tones).
      this.engine.play(SOUND_TICK);
    }
  }
}
