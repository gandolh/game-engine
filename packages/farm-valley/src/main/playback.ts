import type { PlaybackControlsPanel } from "../ui";
import type { SimClient } from "../worker/sim-client";

// Brief 72 — client reference for owner-gate check in hotkeys.
// Declared at module scope so registerHotkeys can access it after wirePlayback sets it.
let _client: SimClient | null = null;

// Wall-clock pacing only — never affects what a tick computes.
export let paused = false;
export let speed = 1;

export interface PlaybackHandlers {
  applyPaused: (next: boolean) => void;
  applySpeed: (next: number) => void;
  doStep: () => void;
  doSkipToHighlight: () => void;
}

export function wirePlayback(
  playback: PlaybackControlsPanel,
  client: SimClient,
): PlaybackHandlers {
  _client = client;
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
    if (!paused) return;
    client.step();
  }
  function doSkipToHighlight(): void {
    client.skipToHighlight();
  }

  playback.setOnPause(applyPaused);
  playback.setOnSpeed(applySpeed);
  playback.setOnStep(doStep);
  playback.setOnSkipToHighlight(doSkipToHighlight);
  playback.update({ paused, speed });

  return { applyPaused, applySpeed, doStep, doSkipToHighlight };
}

// P=pause, "."=step. Speed via sidebar buttons; 1-7 select hotbar slots.
// Brief 72 — hotkeys are only active for the run owner; spectators cannot
// control the shared simulation via keyboard shortcuts.
export function registerHotkeys(handlers: PlaybackHandlers): void {
  const { applyPaused, doStep, doSkipToHighlight } = handlers;
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
      return;
    }
    // Spectators cannot control the run via hotkeys.
    if (_client !== null && !_client.owner) return;
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
