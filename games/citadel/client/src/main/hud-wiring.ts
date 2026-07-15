import { ToastManager } from "../ui/toast";
import { CitadelAudio } from "../ui/audio";
import { OccupancyBadgeLayer } from "../render/occupancy-badges";
import { toastLiveEl } from "./dom";

// Event toasts (top-center) now render IN-CANVAS via @engine/ui (toast.ts builds a
// @engine/ui column the render loop lays out + draws). Created at module scope so it
// exists before the first snapshot; #toast-live is its hidden aria-live a11y mirror.
export const toasts = new ToastManager(toastLiveEl);

// Brief 19 (Chunk C): the same 3-sound procedural palette, fed one new event at a time from the
// SAME newEventsSince pass that feeds toasts below — see the loop over snap.eventsSeq in
// sim-client.ts's onSnapshot handler.
export const citadelAudio = new CitadelAudio();
// AudioContext starts browser-suspended until a real user gesture; unlock once on the first
// pointer or key press, then stop listening (a repeat unlock() on an already-running context is
// a documented no-op, but there's no reason to keep the listeners attached after that).
function unlockCitadelAudioOnce(): void {
  void citadelAudio.unlock();
  window.removeEventListener("pointerdown", unlockCitadelAudioOnce);
  window.removeEventListener("keydown", unlockCitadelAudioOnce);
}
window.addEventListener("pointerdown", unlockCitadelAudioOnce);
window.addEventListener("keydown", unlockCitadelAudioOnce);

// Per-building occupancy badges (Part B): headcount chips floated over each
// building that has people at it. Now render IN-CANVAS via @engine/ui (pooled
// panel+label chips the render loop lays out + draws), replacing the DOM overlay.
export const occupancyBadges = new OccupancyBadgeLayer();
