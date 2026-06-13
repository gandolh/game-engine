import { AnimationClip } from "@engine/core";
import type { AnimationEvent } from "@engine/core";

export function loopClip(
  name: string,
  frames: readonly string[],
  periodMs: number,
  events?: readonly AnimationEvent[],
): AnimationClip {
  const durationMs = periodMs / frames.length;
  return new AnimationClip({
    name,
    loop: true,
    frames: frames.map((frame) => ({ frame, durationMs })),
    ...(events ? { events } : {}),
  });
}

export function cycleIndex(clip: AnimationClip, nowMs: number, phaseFrames = 0): number {
  const per = clip.totalDurationMs / clip.frames.length;
  return (Math.floor(nowMs / per) + phaseFrames) % clip.frames.length;
}

export function sampleCycle(clip: AnimationClip, nowMs: number, phaseFrames = 0): string {
  return clip.frames[cycleIndex(clip, nowMs, phaseFrames)]!.frame;
}
