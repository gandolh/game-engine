/**
 * Farm Valley's 3-sound test palette for the engine audio subsystem (brief 19, Chunk B) — a
 * client/render concern only, never touched from sim-core. Wraps `@engine/core/audio`'s
 * `AudioEngine` and maps `SnapshotEvent.text` to one of 3 procedural (zero-asset) synth blips,
 * keyed off the SAME matchers juice.ts uses for its popups (`GOLD_TRADE_RE`, `isVictoryEvent`,
 * `isMisfortuneEvent`) so audio and popups never disagree about what counts as "gold"/"victory"/
 * "misfortune".
 *
 * `FarmAudio` implements `JuiceAudioSink` and is fed one new event at a time from
 * `JuiceLayer.processEvent` — that call site already gates on the tick high-water mark and
 * `pendingSkip`, so a resync's stale backlog never reaches `onEvent` here.
 */
import { AudioEngine, type SoundSpec } from "@engine/core/audio";
import type { SnapshotEvent } from "@farm/sim-core/snapshot";
import { GOLD_TRADE_RE, isVictoryEvent, isMisfortuneEvent, type JuiceAudioSink } from "./juice";

const SOUND_COIN = "farm.coin";
const SOUND_VICTORY = "farm.victory";
const SOUND_MISFORTUNE = "farm.misfortune";

/**
 * The narrow `AudioEngine` surface `FarmAudio` needs. An interface (rather than the concrete
 * class) so tests can substitute a recording fake without standing up a real `AudioContext` —
 * a plain object literal can satisfy this shape, but not a class with private fields.
 */
export interface AudioPlayer {
  register(id: string, spec: SoundSpec): void;
  play(id: string, opts?: { gain?: number; pitch?: number }): boolean;
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  volume: number;
  muted: boolean;
}

export class FarmAudio implements JuiceAudioSink {
  private readonly engine: AudioPlayer;

  constructor(engine: AudioPlayer = new AudioEngine()) {
    this.engine = engine;

    // Coin blip — short square-wave upward chirp for a gold trade.
    this.engine.register(SOUND_COIN, {
      kind: "synth",
      osc: "square",
      freq: 880,
      durationMs: 90,
      gain: 0.5,
      sweepToFreq: 1320,
    });

    // Rising arpeggio — a bright triangle run for taking 1st / winning a festival.
    this.engine.register(SOUND_VICTORY, {
      kind: "synth",
      osc: "triangle",
      freq: 440,
      durationMs: 360,
      gain: 0.6,
      arpeggio: [440, 554, 659, 880],
    });

    // Low buzz — a downward sawtooth sweep for drought / a missed contract.
    this.engine.register(SOUND_MISFORTUNE, {
      kind: "synth",
      osc: "sawtooth",
      freq: 110,
      durationMs: 320,
      gain: 0.35,
      sweepToFreq: 70,
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

  onEvent(ev: SnapshotEvent): void {
    const t = ev.text;

    if (GOLD_TRADE_RE.test(t)) {
      this.engine.play(SOUND_COIN);
      return;
    }
    if (isVictoryEvent(t)) {
      this.engine.play(SOUND_VICTORY);
      return;
    }
    if (isMisfortuneEvent(t)) {
      this.engine.play(SOUND_MISFORTUNE);
      return;
    }
  }
}
