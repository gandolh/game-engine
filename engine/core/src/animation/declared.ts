import { AnimationClip } from "./clip";
import type { AnimationEvent } from "./clip";

/**
 * An animation as a recipe set declares it, and as the atlas manifest carries it (`animations` beside
 * `frames`): which frames, in order, for how long, and whether it loops. The shape is plain data so a
 * recipe package can write one without importing the engine.
 */
export interface AnimationDeclaration {
  readonly name: string;
  /** Frame names, in play order. */
  readonly frames: readonly string[];
  /** One duration for every frame, or one per frame. */
  readonly frameDurationMs: number | readonly number[];
  /** `loop` repeats, `once` stops on the last frame. */
  readonly mode: "loop" | "once";
}

/** Builds a clip from a declaration, so code names an animation and not its frames. */
export function clipFromDeclaration(decl: AnimationDeclaration, events?: readonly AnimationEvent[]): AnimationClip {
  const { frameDurationMs } = decl;
  if (typeof frameDurationMs !== "number" && frameDurationMs.length !== decl.frames.length) {
    throw new Error(
      `AnimationDeclaration "${decl.name}": ${frameDurationMs.length} durations for ${decl.frames.length} frames`,
    );
  }
  return new AnimationClip({
    name: decl.name,
    loop: decl.mode === "loop",
    frames: decl.frames.map((frame, i) => ({
      frame,
      durationMs: typeof frameDurationMs === "number" ? frameDurationMs : (frameDurationMs[i] ?? 0),
    })),
    ...(events ? { events } : {}),
  });
}
