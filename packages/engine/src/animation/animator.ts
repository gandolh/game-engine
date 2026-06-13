import { AnimationClip } from "./clip";

export class Animator {
  private readonly clips = new Map<string, AnimationClip>();
  private currentClip: AnimationClip | null = null;
  private elapsedMs = 0;

  addClip(clip: AnimationClip): void {
    if (this.clips.has(clip.name)) {
      throw new Error(`Animator: clip "${clip.name}" already registered`);
    }
    this.clips.set(clip.name, clip);
  }

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

  update(deltaMs: number): void {
    if (this.currentClip === null) return;
    if (deltaMs <= 0) return;
    this.elapsedMs += deltaMs;
  }

  currentFrameName(): string | null {
    if (this.currentClip === null) return null;
    return this.currentClip.sampleAt(this.elapsedMs).frameName;
  }

  isFinished(): boolean {
    if (this.currentClip === null) return false;
    return this.currentClip.sampleAt(this.elapsedMs).finished;
  }

  clear(): void {
    this.clips.clear();
    this.currentClip = null;
    this.elapsedMs = 0;
  }
}
