// gl-context.ts — owns the WebGL2RenderingContext: canvas attrs, DPR-aware
// resize, and context loss/restore. Sibling of ../webgpu/gpu-context.ts;
// mirrors its shape (a thin class wrapping the raw context + a static
// `create`) so briefs 03-07/10 find a familiar surface. Do not add a
// WebGL1 fallback path here — WebGL2 is the floor for this migration.
//
// Context-loss handling has no WebGPU analogue (WebGPU surfaces loss via
// `device.lost`, handled per-renderer) — WebGL2 contexts are lost far more
// routinely (tab backgrounding, GPU reset, driver hiccup), so this module
// owns the seam: register the two DOM events, expose `isLost()` plus
// `onContextLost`/`onContextRestored` hooks, and degrade quietly. Full GPU
// resource re-creation on restore (rebuilding every buffer/texture/program
// a pass owns) is explicitly OUT OF SCOPE for this brief — see the
// "Context-loss seam" note at the bottom of this file.

/** Handler invoked when the context is lost. Receives no arguments. */
export type ContextLostHandler = () => void;
/** Handler invoked when the context is restored. Receives no arguments. */
export type ContextRestoredHandler = () => void;

/** Unsubscribe function returned by `onContextLost`/`onContextRestored`. */
export type Unsubscribe = () => void;

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false, // pixel-art engine — never smooth.
  // Sprite ordering is CPU-sorted (compareSprite), not depth-tested, so 2D never
  // wants a depth buffer. 3D does — pass `{ depth: true }` to `createGlContext`
  // rather than creating the context behind this module's back (see GlContextOptions).
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
};

/**
 * Per-canvas context options.
 *
 * `depth` exists because 2D and 3D genuinely disagree: the 2D sprite path is
 * CPU-sorted and wants no depth buffer, while `render3d` requires one. WebGL2
 * only honours context attributes on the FIRST `getContext` call for a canvas —
 * every later call returns the already-created context and silently ignores the
 * new attributes. So a caller that needs depth must say so HERE, on the call that
 * creates the context. Asking for it afterwards fails silently, with no error and
 * a visibly wrong render, which is exactly the failure class this option removes.
 */
export interface GlContextOptions {
  /** Allocate a depth buffer (3D needs this; 2D must not). Defaults to `false`. */
  depth?: boolean;
}

/**
 * The device-pixel-ratio clamp used throughout the renderer stack (see
 * ../webgpu/renderer.ts's `beginFrame`/`overlay-2d.ts`): never scale past
 * 2x even on very-high-DPI displays, to keep fill-rate bounded.
 */
const MAX_DPR = 2;

export class GlContext {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;

  private _lost = false;
  private readonly _lostHandlers = new Set<ContextLostHandler>();
  private readonly _restoredHandlers = new Set<ContextRestoredHandler>();

  private readonly _handleContextLost: (ev: Event) => void;
  private readonly _handleContextRestored: (ev: Event) => void;

  private constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
    this.gl = gl;
    this.canvas = canvas;

    // WebGL fires "webglcontextlost" as a cancelable event; NOT calling
    // preventDefault() tells the browser restoration will never be
    // attempted, so this is required, not optional hygiene.
    this._handleContextLost = (ev: Event): void => {
      ev.preventDefault();
      this._lost = true;
      for (const handler of this._lostHandlers) handler();
    };
    this._handleContextRestored = (): void => {
      this._lost = false;
      for (const handler of this._restoredHandlers) handler();
    };

    canvas.addEventListener("webglcontextlost", this._handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", this._handleContextRestored, false);
  }

  /**
   * Create a `GlContext` from a canvas. Throws `"webgl2: context
   * unavailable"` (greppable/catchable, matching `gpu-context.ts`'s message
   * style) when `getContext("webgl2", ...)` returns null — the browser
   * either doesn't support WebGL2 or has exhausted its context budget.
   * A later brief (09) turns this catch into the user-facing fallback screen.
   */
  static create(canvas: HTMLCanvasElement, options?: GlContextOptions): GlContext {
    const attributes: WebGLContextAttributes = {
      ...CONTEXT_ATTRIBUTES,
      depth: options?.depth ?? false,
    };
    const gl = canvas.getContext("webgl2", attributes) as WebGL2RenderingContext | null;
    if (!gl) {
      throw new Error("webgl2: context unavailable");
    }
    return new GlContext(gl, canvas);
  }

  /**
   * Resize the backing canvas. `cssWidth`/`cssHeight` are **CSS pixels**
   * (the non-negotiable invariant shared with `RendererLike`: callers
   * always author in CSS pixels, the backend scales by DPR internally).
   * This method does that scaling: it multiplies by
   * `min(window.devicePixelRatio || 1, 2)`, floors to an integer device-pixel
   * size, and only touches `canvas.width`/`height` (and re-issues
   * `gl.viewport`) when the size actually changed — matching
   * `gpu-context.ts#resize`'s no-op-when-unchanged guard. `gl.viewport` has
   * no WebGPU equivalent (WebGPU re-derives the attachment size from
   * `getCurrentTexture()` every frame); WebGL2 requires it be kept in sync
   * explicitly or drawing silently clips to the old size.
   */
  resize(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      MAX_DPR,
    );
    const width = Math.max(1, Math.floor(cssWidth * dpr));
    const height = Math.max(1, Math.floor(cssHeight * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (!this._lost) {
      this.gl.viewport(0, 0, width, height);
    }
  }

  /** True from the moment `webglcontextlost` fires until `webglcontextrestored` fires. */
  isLost(): boolean {
    return this._lost;
  }

  /**
   * Register a handler to run when the context is lost. A pass should use
   * this to flip its own "skip this frame" flag rather than letting GL
   * calls on a dead context throw. Returns an unsubscribe function.
   */
  onContextLost(handler: ContextLostHandler): Unsubscribe {
    this._lostHandlers.add(handler);
    return () => this._lostHandlers.delete(handler);
  }

  /**
   * Register a handler to run when the context is restored. NOTE: this
   * brief does not re-create GPU resources on restore (see the seam note
   * below) — a handler registered here fires, but nothing currently
   * re-uploads buffers/textures/programs. That is deliberately left for a
   * later brief to wire up per-pass.
   */
  onContextRestored(handler: ContextRestoredHandler): Unsubscribe {
    this._restoredHandlers.add(handler);
    return () => this._restoredHandlers.delete(handler);
  }

  /**
   * Release the context (`WEBGL_lose_context.loseContext()` where the
   * extension is available — it is not guaranteed, so this is
   * best-effort) and detach the loss/restore DOM listeners. Does not
   * touch any pass-owned GL resource (buffers/textures/programs); callers
   * dispose those themselves before or after calling this.
   */
  dispose(): void {
    this.canvas.removeEventListener("webglcontextlost", this._handleContextLost, false);
    this.canvas.removeEventListener("webglcontextrestored", this._handleContextRestored, false);

    const loseExt = this.gl.getExtension("WEBGL_lose_context") as { loseContext(): void } | null;
    loseExt?.loseContext();

    this._lostHandlers.clear();
    this._restoredHandlers.clear();
  }
}

/**
 * Factory mirroring `GpuContext`'s naming (`createGlContext` next to
 * `GlContext`, same as `GpuContext.create`). Synchronous, unlike
 * `GpuContext.create` — there is no adapter/device negotiation step in
 * WebGL2, so no `Promise` is needed.
 */
export function createGlContext(canvas: HTMLCanvasElement, options?: GlContextOptions): GlContext {
  return GlContext.create(canvas, options);
}

// ── Context-loss seam: what IS and ISN'T handled here ──────────────────────
//
// Handled: the browser-level loss/restore event pair, `isLost()`, the two
// subscription hooks, and `preventDefault()` on loss (without it the
// browser gives up on ever restoring). A pass/renderer can call `isLost()`
// at the top of its frame method and no-op instead of issuing GL calls
// against a dead context (which would otherwise spam `INVALID_OPERATION`
// to the console).
//
// NOT handled (deliberately, per this brief's scope): re-creating any GPU
// resource after restore. Every buffer, texture, VAO, and compiled program
// a pass owns is invalidated by a context loss and is NOT automatically
// rebuilt when `webglcontextrestored` fires — `onContextRestored` fires the
// registered handlers, but no handler is registered by this module to
// rebuild anything, because this module owns no pass resources to rebuild.
// A future brief must give each pass an explicit "re-upload everything"
// path wired to `onContextRestored`, or the app will render a black/frozen
// screen after any tab-backgrounding-induced loss on real hardware. This
// gap should be filed as an explicit follow-up brief.
