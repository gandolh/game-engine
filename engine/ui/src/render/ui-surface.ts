import type { RendererLike, UIQuad } from "@engine/core/render";

/**
 * `UISurface` — the `@engine/ui` framework's thin handle over a backend renderer's
 * screen-space UI draw seam (`RendererLike.beginUI/pushUI/endUI`).
 *
 * It is deliberately backend-agnostic: it neither knows nor cares whether the
 * underlying `RendererLike` is the WebGL2 backend. UI submitted
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
/** A quad record the surface reuses, with every optional field present so a reuse can clear it. */
interface PooledQuad {
  x: number;
  y: number;
  width: number;
  height: number;
  atlasId: string | undefined;
  frame: string | undefined;
  color: string | undefined;
  alpha: number;
}

export class UISurface {
  private readonly renderer: RendererLike;
  /**
   * Quad records for `rect`, `sprite` and `quad`. The renderer holds each pushed quad until its frame ends, so
   * a record is free again only at the next `begin()`: that resets `poolLen`, not the records.
   */
  private readonly pool: PooledQuad[] = [];
  private poolLen = 0;

  constructor(renderer: RendererLike) {
    this.renderer = renderer;
  }

  /** Opens the per-frame UI draw-list (resets any prior submissions). */
  begin(): void {
    this.poolLen = 0;
    this.renderer.beginUI();
  }

  /** Submits a raw UI quad (textured or solid) in screen pixels. */
  push(quad: UIQuad): void {
    this.renderer.pushUI(quad);
  }

  /**
   * Submits a quad built from a reused record, so a frame of text allocates no quad objects. Pass `undefined`
   * for `atlasId` and `frame` to draw a solid `color` quad, and for `color` to draw an untinted frame.
   */
  quad(
    x: number,
    y: number,
    width: number,
    height: number,
    atlasId: string | undefined,
    frame: string | undefined,
    color: string | undefined,
    alpha: number,
  ): void {
    let q = this.pool[this.poolLen];
    if (q === undefined) {
      q = { x, y, width, height, atlasId, frame, color, alpha };
      this.pool[this.poolLen] = q;
    } else {
      q.x = x;
      q.y = y;
      q.width = width;
      q.height = height;
      q.atlasId = atlasId;
      q.frame = frame;
      q.color = color;
      q.alpha = alpha;
    }
    this.poolLen += 1;
    // The renderer reads the optional fields with `!== undefined`, so an explicit undefined means "omitted".
    this.renderer.pushUI(q as UIQuad);
  }

  /** Convenience: a solid-colour quad. `color` must be an EDG32 palette hex. */
  rect(x: number, y: number, width: number, height: number, color: string, alpha = 1): void {
    this.quad(x, y, width, height, undefined, undefined, color, alpha);
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
    this.quad(x, y, width, height, atlasId, frame, tint, alpha);
  }

  /** Closes the per-frame UI draw-list. */
  end(): void {
    this.renderer.endUI();
  }
}
