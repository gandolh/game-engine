/**
 * Overlay2D — a transparent `<canvas>` stacked exactly over the WebGPU canvas.
 *
 * Provides a `Ctx2D` for particles, weather, and the day/night screen-space wash.
 * The overlay canvas is CSS-positioned identically to the GPU canvas (same client box,
 * pointer-events: none) and sits one z-index above it.
 *
 * SHADOWS ARE NOT DRAWN HERE.  Shadow ellipses use `globalCompositeOperation = "multiply"`
 * which only works when composited onto an opaque surface.  On this transparent overlay the
 * multiply mode produces no darkening effect against the world beneath — "multiply" on
 * transparent pixels yields transparent, not a darkened composite.  Shadows are therefore
 * rendered GPU-side (dark translucent quads/ellipses in the sprite pass) by Wave 2.
 * See corpus/briefs/engine/todo/webgpu/wave-1d-overlay-2d.md §"Shadows decision" for
 * the full decision record.
 */
import type { Ctx2D } from "../canvas2d/types";
import type { ViewUniform } from "./gpu-context";

export class Overlay2D {
  /** overlay must NOT clear to a solid color */
  readonly clearColorIsTransparent: true = true;

  /** The 2D context handed to particles, weather, and wash draws. */
  readonly ctx: Ctx2D;

  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly gpuCanvas: HTMLCanvasElement;

  /**
   * Creates and CSS-positions a new `<canvas>` as a sibling of `gpuCanvas`.
   *
   * The overlay canvas shares the same CSS box as the GPU canvas:
   *   - same position/left/top (copied from gpuCanvas.style at construction time)
   *   - same CSS width/height (kept in sync every `beginFrame`)
   *   - `pointer-events: none` so it never intercepts input
   *   - `z-index` one above the GPU canvas so it renders on top
   *
   * If `gpuCanvas.parentElement` is null (detached / test context) the overlay is
   * created and fully usable; it simply isn't inserted into the DOM.
   */
  constructor(gpuCanvas: HTMLCanvasElement) {
    this.gpuCanvas = gpuCanvas;

    const overlay = document.createElement("canvas");

    // Mirror the GPU canvas's CSS position.
    const gpuStyle = gpuCanvas.style;
    overlay.style.position = gpuStyle.position || "absolute";
    overlay.style.left     = gpuStyle.left   || "0";
    overlay.style.top      = gpuStyle.top    || "0";

    // Never intercept pointer/touch/wheel events.
    overlay.style.pointerEvents = "none";

    // Sit one z-index above the GPU canvas.
    const baseZ = parseInt(gpuCanvas.style.zIndex || "0", 10);
    overlay.style.zIndex = String(isNaN(baseZ) ? 1 : baseZ + 1);

    if (gpuCanvas.parentElement !== null) {
      // Insert immediately after the GPU canvas so stacking order is predictable.
      gpuCanvas.parentElement.insertBefore(overlay, gpuCanvas.nextSibling);
    }

    const ctx2d = overlay.getContext("2d");
    if (!ctx2d) throw new Error("Overlay2D: failed to acquire 2d context for overlay canvas");
    ctx2d.imageSmoothingEnabled = false;

    this.overlayCanvas = overlay;
    this.ctx = ctx2d;
  }

  /**
   * Must be called once per frame, before any drawing.
   *
   * Matches the overlay canvas's device-pixel size to the base (GPU) canvas using the
   * same DPR rule as `Canvas2dRenderer.beginFrame`:
   *
   *   dpr = min(window.devicePixelRatio || 1, 2)
   *   canvas.width  = floor(gpuCanvas.clientWidth  * dpr)
   *   canvas.height = floor(gpuCanvas.clientHeight * dpr)
   *
   * The overlay CSS width/height is also kept in sync every frame so window resize and
   * DPR changes (e.g. moving the window to a high-DPI display) are handled automatically.
   *
   * Clears to **transparent** (NOT a solid colour — the GPU canvas provides the
   * background).  The caller must not rely on the previous frame's content surviving.
   */
  beginFrame(): void {
    const dpr = Math.min(
      (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1,
      2,
    );

    const clientW = this.gpuCanvas.clientWidth;
    const clientH = this.gpuCanvas.clientHeight;
    const desiredW = Math.max(1, Math.floor(clientW * dpr));
    const desiredH = Math.max(1, Math.floor(clientH * dpr));

    // Keep CSS dimensions in sync so the two canvases share the same client box.
    const cssW = `${clientW}px`;
    const cssH = `${clientH}px`;
    if (this.overlayCanvas.style.width  !== cssW) this.overlayCanvas.style.width  = cssW;
    if (this.overlayCanvas.style.height !== cssH) this.overlayCanvas.style.height = cssH;

    // Only resize the backing store when dimensions actually change to avoid
    // unnecessary clears and layout thrash.
    if (this.overlayCanvas.width !== desiredW || this.overlayCanvas.height !== desiredH) {
      this.overlayCanvas.width  = desiredW;
      this.overlayCanvas.height = desiredH;
    }

    // Reset to identity then clear to fully transparent.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, desiredW, desiredH);
  }

  /**
   * Applies the same world→screen transform the GPU sprite pass uses, so particles and
   * weather (authored in world pixels) are positioned identically on both surfaces.
   *
   * The transform exactly mirrors `Canvas2dRenderer.endFrame`:
   *
   *   ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY)
   *
   * where the four values come from the `ViewUniform` that Wave 2 computes from the
   * camera each frame (see §3.1 and §4 of 01-architecture.md).
   *
   * ViewUniform field semantics assumed here:
   *   scaleX / scaleY  — world-px → canvas device-px scale factors
   *   offsetX / offsetY — pan in device pixels (already pixel-snapped by Wave 1a
   *                        when `pixelSnap` is true)
   *
   * ASSUMPTION FOR WAVE 2: offsetX/offsetY must be expressed in **device pixels**
   * (not CSS pixels), consistent with how the GPU pass uses them as clip-space
   * parameters.  If Wave 1a's `GpuContext.setView` stores them in a different unit,
   * Wave 2 must convert before calling `applyWorldTransform`.
   */
  applyWorldTransform(view: ViewUniform): void {
    this.ctx.setTransform(view.scaleX, 0, 0, view.scaleY, view.offsetX, view.offsetY);
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Resets the canvas transform to screen (identity) space so the caller can paint the
   * day/night wash across the full canvas extent without a world-space transform in effect.
   */
  resetTransform(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
