/**
 * WebGL2 device acquisition for the 3D render layer. Synchronous, mirroring
 * `createGlContext`'s own choice (`../../render/webgl2/gl-context.ts`): WebGL2 has
 * no adapter/device negotiation step, so there is no `Promise` to thread.
 *
 * Reuses `createGlContext` for context acquisition and loss/restore handling rather
 * than rolling a second one, so every bit of `GlContext`'s loss/restore wiring,
 * `resize()` and `dispose()` works here unmodified. This file only adds the
 * depth/cull GL state 3D needs on top.
 *
 * **The depth buffer is the one thing 3D needs that the 2D path does not.** The 2D
 * sprite path is CPU-sorted (painter's algorithm), and depth-testing would fight
 * that ordering, so `GlContext` defaults to `depth: false`. 3D asks for it
 * EXPLICITLY through `GlContextOptions`: `createGlContext(canvas, { depth: true })`.
 *
 * Do not replace that with the older trick of pre-warming the canvas by calling
 * `canvas.getContext("webgl2", { depth: true })` before `createGlContext`. It does
 * work — a canvas's WebGL context is created once per (canvas, contextType) pair, so
 * the FIRST `getContext` wins the attributes and later calls return that same context
 * while silently ignoring their own attrs. But it is order-dependent, and it fails
 * SILENTLY if anything ever creates the context first: no error, just a visibly wrong
 * render. An explicit option cannot be got wrong by accident.
 */
import { createGlContext, type GlContext } from "../../render/webgl2/gl-context";

/**
 * WebGL2 device + depth-enabled GL state, ready for a `SceneRenderer3D`
 * (brief 11) to draw into. Sibling of the WebGPU `Device3d`, but exposes the
 * raw `WebGL2RenderingContext` directly (there is no `GPUQueue`/format
 * negotiation step in WebGL2) plus the underlying `GlContext` as an escape
 * hatch for its full API (`resize`, `isLost`, `onContextLost`,
 * `onContextRestored`, `dispose`) rather than re-wrapping every method here.
 */
export class GlDevice3d {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  /** Escape hatch: the underlying `GlContext` this device wraps, for its
   *  full loss/restore/resize/dispose API. */
  readonly glContext: GlContext;
  /** `gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE)`, queried once at device
   *  creation. Brief 11 needs this to size the materials table's
   *  compile-time `MAX_MATERIALS` bound (the WebGPU path's unbounded
   *  `storage` buffer becomes a fixed-size `std140` UBO in WebGL2 — see
   *  `pipeline-cache.ts`'s module doc). */
  readonly maxUniformBlockSize: number;

  private constructor(glContext: GlContext, maxUniformBlockSize: number) {
    this.glContext = glContext;
    this.gl = glContext.gl;
    this.canvas = glContext.canvas;
    this.maxUniformBlockSize = maxUniformBlockSize;
  }

  /** Whether the underlying WebGL2 context is currently lost (see
   *  `GlContext#isLost`). A renderer should check this before issuing GL
   *  calls, same as the WebGPU sibling's `.lost` getter. */
  get lost(): boolean {
    return this.glContext.isLost();
  }

  static create(canvas: HTMLCanvasElement): GlDevice3d {
    // Depth is requested EXPLICITLY through GlContextOptions. It used to be
    // obtained by pre-warming the canvas with our own getContext call before
    // createGlContext's — which worked (first call wins the attributes) but was
    // order-dependent and would have failed SILENTLY if anything ever created the
    // context first. An explicit option cannot be got wrong by accident.
    let glContext: GlContext;
    try {
      glContext = createGlContext(canvas, { depth: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `render3d: webgl2 context unavailable (WebGL2 not supported in this browser): ${message}`,
      );
    }

    const gl = glContext.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    const maxUniformBlockSize = gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE) as number;

    return new GlDevice3d(glContext, maxUniformBlockSize);
  }
}

/** Convenience wrapper around `GlDevice3d.create` — the public entry point,
 *  mirroring `createDevice3d`'s naming in `../webgpu/device3d.ts`. */
export function createGlDevice3d(canvas: HTMLCanvasElement): GlDevice3d {
  return GlDevice3d.create(canvas);
}
