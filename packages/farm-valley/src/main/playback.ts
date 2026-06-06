import type { PlaybackControlsPanel } from "../ui";
import type { SimClient } from "../worker/sim-client";

// brief-16: playback — module-level pacing state. These only change the
// wall-clock cadence of worker ticks; sim state for a given tick count is
// unaffected (determinism preserved).
export let paused = false;
export let speed = 1;

export interface PlaybackHandlers {
  applyPaused: (next: boolean) => void;
  applySpeed: (next: number) => void;
  doStep: () => void;
  doSkipToHighlight: () => void;
}

// brief-16: playback — wire the controls to the worker and keep the panel
// reflecting state. Pause/speed/step only retime when worker ticks run;
// they never alter what a tick computes.
export function wirePlayback(
  playback: PlaybackControlsPanel,
  client: SimClient,
): PlaybackHandlers {
  function applyPaused(next: boolean): void {
    paused = next;
    client.setPaused(paused);
    playback.update({ paused, speed });
  }
  function applySpeed(next: number): void {
    speed = next;
    client.setSpeed(speed);
    playback.update({ paused, speed });
  }
  function doStep(): void {
    // Step only makes sense while paused.
    if (!paused) return;
    client.step();
  }
  function doSkipToHighlight(): void {
    // Brief 40 — fast-forward to the next high-drama event.
    client.skipToHighlight();
  }

  playback.setOnPause(applyPaused);
  playback.setOnSpeed(applySpeed);
  playback.setOnStep(doStep);
  playback.setOnSkipToHighlight(doSkipToHighlight);
  playback.update({ paused, speed });

  return { applyPaused, applySpeed, doStep, doSkipToHighlight };
}

// Keyboard: P = toggle pause, "." = step. (Speed is set via the sidebar
// buttons; number keys 1-7 are the player's hotbar selection.) Ignore keys
// while the user is typing into an input/textarea (e.g. the seed field).
export function registerHotkeys(handlers: PlaybackHandlers): void {
  const { applyPaused, doStep, doSkipToHighlight } = handlers;
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
      return;
    }
    switch (e.key) {
      // Pause is on "p" — Space is reserved for the player's action, and the
      // number keys 1-7 now select hotbar slots (handled in the input loop), so
      // speed is set via the sidebar buttons rather than 1/2/4 hotkeys.
      case "p":
      case "P":
        e.preventDefault();
        applyPaused(!paused);
        break;
      case ".":
        doStep();
        break;
      // Brief 40 — H: skip to the next high-drama event.
      // "H" is free: not used by WASD/arrows (Pip movement), not 1–8 (hotbar),
      // not E (action), not Space (recenter), not P (pause), not "." (step).
      case "h":
      case "H":
        e.preventDefault();
        doSkipToHighlight();
        break;
      default:
        break;
    }
  });
}
