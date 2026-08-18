/**
 * WebGL2 device acquisition for the 3D render layer — sibling of
 * `../webgpu/device3d.ts`, but synchronous: mirrors `createGlContext`'s own
 * choice (`../../render/webgl2/gl-context.ts`) to drop the `Promise` WebGPU
 * needs for adapter/device negotiation — WebGL2 has no such step.
 *
 * Reuses `createGlContext` for context acquisition + loss/restore handling
 * rather than rolling a second one. The catch: 3D **needs a depth buffer**,
 * and the shared 2D `GlContext.create()` hardcodes `depth: false` (correct
 * for the CPU-sorted 2D sprite path — depth-testing would fight its
 * painter's-algorithm ordering). `GlContext.create()` has no options
 * parameter to override that, and editing `gl-context.ts` is out of this
 * module's lane this wave (five other agents are in `render/webgl2/`).
 *
 * The fix relies on a documented DOM contract instead of a code change: a
 * canvas's WebGL context is created ONCE per (canvas, contextType) pair —
 * the FIRST `getContext("webgl2", attrs)` call for a given canvas wins the
 * attributes, and every subsequent call for that same canvas/type returns
 * the SAME context object, silently ignoring whatever attrs are passed this
 * time. So `create()` below calls `canvas.getContext("webgl2", ...)` itself
 * with depth enabled BEFORE calling `createGlContext(canvas)` — that
 * "pre-warms" the canvas with a depth buffer, and `createGlContext`'s own
 * internal `getContext` call then just receives the already-created (depth
 * -enabled) context back and wraps it exactly as it would any other. Every
 * bit of `GlContext`'s loss/restore wiring, `resize()`, and `dispose()`
 * keeps working unmodified — this file only adds the depth/cull GL state
 * 3D needs on top.
 *
 * FOLLOW-UP (flagged, not fixed here — not in this brief's lane): this is a
 * Depth is requested explicitly via `createGlContext(canvas, { depth: true })`.
 * This replaced an earlier workaround that pre-warmed the canvas with its own
 * `getContext` call: WebGL2 honours context attributes only on the FIRST
 * `getContext` for a canvas, so that worked, but it was order-dependent and would
 * have failed SILENTLY (no error, visibly wrong render) if anything ever created
 * the context first.
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
