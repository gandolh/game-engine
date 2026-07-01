import type { PlaybackActions } from "../ui/canvas/playback-controls";
import type { SimClient } from "../worker/sim-client";

let _client: SimClient | null = null;

/**
 * Live playback state, read every frame by the render loop to refresh the in-canvas playback
 * controls panel. Mutated by the handlers below (and the hotkeys). A single mutable object so the
 * render loop sees the current values without importing mutable `let` bindings.
 */
export const playbackState: { paused: boolean; speed: number } = { paused: false, speed: 1 };

export interface PlaybackHandlers {
  applyPaused: (next: boolean) => void;
  applySpeed: (next: number) => void;
  doStep: () => void;
  doSkipToHighlight: () => void;
}

/**
 * Build the {@link PlaybackActions} the in-canvas playback-controls panel invokes, wired to the
 * sim client, and return the handlers the hotkey layer + host share. The panel itself is refreshed
 * by the render loop from {@link playbackState}; this module only owns the command side effects.
 */
export function wirePlayback(client: SimClient): {
  actions: PlaybackActions;
  handlers: PlaybackHandlers;
} {
  _client = client;
  function applyPaused(next: boolean): void {
    playbackState.paused = next;
    client.setPaused(next);
  }
  function applySpeed(next: number): void {
    playbackState.speed = next;
    client.setSpeed(next);
  }
  function doStep(): void {
    if (!playbackState.paused) return;
    client.step();
  }
  function doSkipToHighlight(): void {
    client.skipToHighlight();
  }

  const handlers: PlaybackHandlers = { applyPaused, applySpeed, doStep, doSkipToHighlight };

  const actions: PlaybackActions = {
    togglePause: () => applyPaused(!playbackState.paused),
    setSpeed: (n: number) => applySpeed(n),
    step: () => doStep(),
    skipToHighlight: () => doSkipToHighlight(),
  };

  return { actions, handlers };
}

export function registerHotkeys(handlers: PlaybackHandlers): void {
  const { applyPaused, doStep, doSkipToHighlight } = handlers;
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
      return;
    }

    if (_client !== null && !_client.owner) return;
    switch (e.key) {

      case "p":
      case "P":
        e.preventDefault();
        applyPaused(!playbackState.paused);
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
