import type { RendererLike, UIQuad } from "@engine/core/render";

/**
 * `UISurface` — the `@engine/ui` framework's thin handle over a backend renderer's
 * screen-space UI draw seam (`RendererLike.beginUI/pushUI/endUI`).
 *
 * It is deliberately backend-agnostic: it neither knows nor cares whether the
 * underlying `RendererLike` is `WebGpuRenderer` or `Canvas2dRenderer`. UI submitted
 * through it draws ON TOP of the world scene in **screen pixels** (origin top-left),
 * unaffected by the world `Camera2D`. See `RendererLike.beginUI` for the lifecycle and
 * `UIQuad` for coordinate/colour semantics.
 *
 * Typical per-frame usage by higher UI chunks:
 *
 *   surface.begin();
 *   surface.rect(8, 8, 120, 32, EDG.darkBrown, 0.85);   // solid panel
 *   surface.sprite(12, 12, 24, 24, "ui", "icon/coin");  // textured icon
 *   surface.end();
 *
 * The accumulated draw-list is flushed by the renderer inside its own `endFrame()`.
 */
export class UISurface {
  private readonly renderer: RendererLike;

  constructor(renderer: RendererLike) {
    this.renderer = renderer;
  }

  /** Opens the per-frame UI draw-list (resets any prior submissions). */
  begin(): void {
    this.renderer.beginUI();
  }

  /** Submits a raw UI quad (textured or solid) in screen pixels. */
  push(quad: UIQuad): void {
    this.renderer.pushUI(quad);
  }

  /** Convenience: a solid-colour quad. `color` must be an EDG32 palette hex. */
  rect(x: number, y: number, width: number, height: number, color: string, alpha = 1): void {
    this.renderer.pushUI({ x, y, width, height, color, alpha });
  }

  /** Convenience: a textured quad from an atlas frame, with optional EDG32 tint. */
  sprite(
    x: number,
    y: number,
    width: number,
    height: number,
    atlasId: string,
    frame: string,
    alpha = 1,
    tint?: string,
  ): void {
    const quad: UIQuad = { x, y, width, height, atlasId, frame, alpha };
    if (tint !== undefined) quad.color = tint;
    this.renderer.pushUI(quad);
  }

  /** Closes the per-frame UI draw-list. */
  end(): void {
    this.renderer.endUI();
  }
}
