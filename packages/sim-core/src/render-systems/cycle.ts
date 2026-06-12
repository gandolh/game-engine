import { AnimationClip } from "@engine/core";

/**
 * Generic wall-clock cycling over an engine `AnimationClip`, plus a factory for
 * the uniform looping clips our scenery uses. Frame-name-free so both
 * `frames.ts` and `clips.ts` can depend on it without an import cycle.
 *
 * These replace the hand-rolled `floor(nowMs/(period/len)) % len` cyclers that
 * were duplicated across the render code. All render-only (no determinism
 * impact) — the caller passes `nowMs`.
 */

/** Build a looping clip whose frames each hold for `periodMs / frames.length`. */
export function loopClip(name: string, frames: readonly string[], periodMs: number): AnimationClip {
  const durationMs = periodMs / frames.length;
  return new AnimationClip({
    name,
    loop: true,
    frames: frames.map((frame) => ({ frame, durationMs })),
  });
}

/**
 * Frame index of a uniform looping clip at `nowMs`, shifted by an integer
 * `phaseFrames` offset (per-tile desync). Mirrors the old index math exactly.
 */
export function cycleIndex(clip: AnimationClip, nowMs: number, phaseFrames = 0): number {
  const per = clip.totalDurationMs / clip.frames.length;
  return (Math.floor(nowMs / per) + phaseFrames) % clip.frames.length;
}

/** Frame name of a uniform looping clip at `nowMs`, shifted by `phaseFrames`. */
export function sampleCycle(clip: AnimationClip, nowMs: number, phaseFrames = 0): string {
  return clip.frames[cycleIndex(clip, nowMs, phaseFrames)]!.frame;
}
