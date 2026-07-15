/**
 * Audio is a client/render concern only — it never runs on the deterministic sim path.
 * The engine stays game-agnostic: it knows nothing about sound ids or events; each game
 * owns its own event → SoundSpec map.
 */

/** A registered sound: procedurally synthesized (v1) or a decoded buffer (future real assets). */
export type SoundSpec =
  | {
      kind: "synth";
      osc: OscillatorType;
      freq: number;
      durationMs: number;
      /** Peak gain of the voice, 0..1 (default 1). */
      gain?: number;
      /** Ramp the frequency to this value across the duration. */
      sweepToFreq?: number;
      /** Step through these frequencies in equal slices across the duration (wins over sweepToFreq). */
      arpeggio?: number[];
    }
  | { kind: "buffer"; buffer: AudioBuffer };

/** The narrow subset of Web Audio the engine uses, so a headless fake is trivial. */
export interface AudioContextLike {
  readonly state: "suspended" | "running" | "closed";
  resume(): Promise<void>;
  readonly currentTime: number;
  readonly destination: AudioNode;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  createBufferSource(): AudioBufferSourceNode;
}

export interface AudioEngineOptions {
  /** Defaults to a feature-detected `new AudioContext()`; absent Web Audio, the engine is a silent stub. */
  contextFactory?: () => AudioContextLike;
  /** 0..1 (default 1). */
  masterVolume?: number;
  /** Concurrent voices; `play()` is skipped past this (default 16). */
  maxVoices?: number;
}

export interface PlayOptions {
  /** Extra gain multiplier on top of the spec's own gain. */
  gain?: number;
  /** Frequency / playback-rate multiplier (default 1). */
  pitch?: number;
}
