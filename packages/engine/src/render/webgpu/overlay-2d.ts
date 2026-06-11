// TODO(wave-1d): implement Overlay2D body
import type { Ctx2D } from "../canvas2d/types";
import type { ViewUniform } from "./gpu-context";

export class Overlay2D {
  /** overlay must NOT clear to a solid color */
  readonly clearColorIsTransparent: true = true;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_gpuCanvas: HTMLCanvasElement) {
    // Filled by Wave 1d: creates & positions the overlay canvas
  }

  /** The 2D context handed to particles/weather/shadow draws. */
  // The actual ctx is set by Wave 1d; typed as any so the stub compiles without initialisation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get ctx(): Ctx2D { throw new Error("Overlay2D.ctx: not implemented (Wave 1d)"); }

  /** Match size/DPR of the base canvas; clear for a new frame. */
  beginFrame(): void {
    throw new Error("Overlay2D.beginFrame: not implemented (Wave 1d)");
  }

  /** Apply the same world->screen transform the GPU pass uses (camera + pixel-snap). */
  applyWorldTransform(_view: ViewUniform): void {
    throw new Error("Overlay2D.applyWorldTransform: not implemented (Wave 1d)");
  }

  /** Reset transform to screen space (for the wash). */
  resetTransform(): void {
    throw new Error("Overlay2D.resetTransform: not implemented (Wave 1d)");
  }
}
