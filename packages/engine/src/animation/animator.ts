import { AnimationClip } from "./clip";

/**
 * Per-entity animation state. Holds a registry of clips and tracks the
 * currently-playing clip's elapsed time.
 *
 * The animator advances in real (wall) milliseconds. The game decides
 * whether to drive `update()` via a fixed-step `stepMs` (deterministic) or
 * via a per-frame render delta.
 */
export class Animator {
  private readonly clips = new Map<string, AnimationClip>();
  private currentClip: AnimationClip | null = null;
  private elapsedMs = 0;

  /** Register a clip. Throws if a clip with the same name is already known. */
  addClip(clip: AnimationClip): void {
    if (this.clips.has(clip.name)) {
      throw new Error(`Animator: clip "${clip.name}" already registered`);
    }
    this.clips.set(clip.name, clip);
  }

  /**
   * Begin playing a registered clip.
   *
   * By default, replaying the already-current clip preserves elapsed time
   * (smooth continuation). Pass `{ reset: true }` to restart from frame 0.
   */
  play(clipName: string, options?: { reset?: boolean }): void {
    const clip = this.clips.get(clipName);
    if (!clip) {
      throw new Error(`Animator: unknown clip "${clipName}"`);
    }
    const reset = options?.reset === true;
    if (this.currentClip !== clip || reset) {
      this.elapsedMs = 0;
    }
    this.currentClip = clip;
  }

  /**
   * Advance the active clip by `deltaMs` wall milliseconds. Pass a fixed
   * step (e.g. tick stepMs) for deterministic playback; pass a render
   * delta for free-running visual animation.
   */
  update(deltaMs: number): void {
    if (this.currentClip === null) return;
    if (deltaMs <= 0) return;
    this.elapsedMs += deltaMs;
  }

  /** Currently-displayed atlas frame name, or null if no clip is playing. */
  currentFrameName(): string | null {
    if (this.currentClip === null) return null;
    return this.currentClip.sampleAt(this.elapsedMs).frameName;
  }

  /** True when the active clip is non-looping and has reached its end. */
  isFinished(): boolean {
    if (this.currentClip === null) return false;
    return this.currentClip.sampleAt(this.elapsedMs).finished;
  }

  /** Stop playback and drop all registered clips. */
  clear(): void {
    this.clips.clear();
    this.currentClip = null;
    this.elapsedMs = 0;
  }
}
