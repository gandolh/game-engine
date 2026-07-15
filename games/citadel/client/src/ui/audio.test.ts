/**
 * Tests for CitadelAudio (brief 19, Chunk C) — event -> sound dispatch via `toneOf`, plus
 * mute/unlock delegation. Uses a recording fake instead of a real AudioContext (none exists
 * under jsdom).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CitadelAudio, type AudioPlayer } from "./audio";
import type { SoundSpec } from "@engine/core/audio";

/** Records `play()` calls instead of touching a real AudioContext. */
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

describe("CitadelAudio — event -> sound dispatch (via toneOf)", () => {
  let fake: FakePlayer;
  let audio: CitadelAudio;

  beforeEach(() => {
    fake = new FakePlayer();
    audio = new CitadelAudio(fake);
  });

  it("registers exactly 3 sounds up front", () => {
    expect(fake.registered.size).toBe(3);
  });

  it("danger tone (fire/raid/disease/…) -> alarm pulse", () => {
    audio.onEvent("A fire breaks out at the smithy!");
    expect(fake.played).toEqual(["citadel.alarm"]);
  });

  it("good tone (promoted/harvest/trade/…) -> chime", () => {
    audio.onEvent("The granary was completed.");
    expect(fake.played).toEqual(["citadel.chime"]);
  });

  it("warn tone (shortage/unrest/…) -> soft tick", () => {
    audio.onEvent("Food shortage looms in the north quarter.");
    expect(fake.played).toEqual(["citadel.tick"]);
  });

  it("info tone (uncategorised) -> soft tick", () => {
    audio.onEvent("The council meets today.");
    expect(fake.played).toEqual(["citadel.tick"]);
  });

  it("muted engine plays nothing", () => {
    fake.muted = true;
    audio.muted = true;
    audio.onEvent("A fire breaks out at the smithy!");
    expect(fake.played).toEqual([]);
  });

  it("unlock() delegates to the underlying engine", async () => {
    expect(fake.unlocked).toBe(false);
    await audio.unlock();
    expect(fake.unlocked).toBe(true);
  });
});
