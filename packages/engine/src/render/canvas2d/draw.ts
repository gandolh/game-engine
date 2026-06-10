import type { LoadedAtlasImage } from "../../assets/loader";
import type { Canvas2dSprite, Ctx2D } from "./types";

/** Stable sort comparator: layer ascending, then Y ascending (`sortY` when a
 *  sprite carries one — see Canvas2dSprite.sortY — otherwise the draw `y`).
 *  JS Array.sort is guaranteed stable (ES2019+), so equal-key sprites
 *  retain their insertion order — no index tiebreaker needed. */
export function compareSprite(a: Canvas2dSprite, b: Canvas2dSprite): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  return (a.sortY ?? a.y) - (b.sortY ?? b.y);
}

/** Draw one sprite via the atlas frame rect. Shared by the live queue and the
 *  static-layer bake so both paths stay pixel-identical.
 *  Resolves the correct sheet atlas via s.atlasId — throws clearly if the sheet
 *  or frame is unknown so misconfigurations surface immediately. */
export function drawSprite(ctx: Ctx2D, atlases: Map<string, LoadedAtlasImage>, s: Canvas2dSprite): void {
  const atlas = atlases.get(s.atlasId);
  if (!atlas) throw new Error(`drawSprite: atlas sheet "${s.atlasId}" not loaded (frame "${s.frame}")`);
  const r = atlas.frameRect(s.frame);
  const bitmap = atlas.bitmap;

  // RGB multiply tint (Farm Valley visual state indicators): when present and
  // not pure white, draw the frame onto a pooled offscreen buffer, multiply it
  // by the tint color (source-atop preserves the frame's alpha mask), and blit
  // the tinted buffer. White (0xffffff) is a no-op so we skip the buffer path.
  const tint = (s.tintRgba ?? 0xffffffff) >>> 0;
  const rgb = tint >>> 8; // drop the alpha byte; RGB is what multiplies
  if (rgb !== 0xffffff) {
    const buf = tintBuffer(r.w, r.h);
    if (buf) {
      const bctx = buf.ctx;
      bctx.clearRect(0, 0, r.w, r.h);
      bctx.globalCompositeOperation = "source-over";
      bctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      bctx.globalCompositeOperation = "multiply";
      bctx.fillStyle = `#${rgb.toString(16).padStart(6, "0")}`;
      bctx.fillRect(0, 0, r.w, r.h);
      // Re-mask to the frame's silhouette so the multiply fill can't bleed into
      // the (transparent) padding around the glyph.
      bctx.globalCompositeOperation = "destination-in";
      bctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      bctx.globalCompositeOperation = "source-over";
      blit(ctx, buf.canvas, r.w, r.h, s);
      return;
    }
    // No offscreen available (e.g. jsdom) — fall through to the untinted draw.
  }

  if (s.rotation !== 0 || s.flipX) {
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.rotation !== 0) ctx.rotate(s.rotation);
    if (s.flipX) ctx.scale(-1, 1);
    ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, -s.width / 2, -s.height / 2, s.width, s.height);
    ctx.restore();
  } else {
    ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, s.x - s.width / 2, s.y - s.height / 2, s.width, s.height);
  }
}

/** Blit a pre-tinted offscreen frame buffer at the sprite's transform. */
function blit(
  ctx: Ctx2D,
  src: OffscreenCanvas | HTMLCanvasElement,
  sw: number,
  sh: number,
  s: Canvas2dSprite,
): void {
  if (s.rotation !== 0 || s.flipX) {
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.rotation !== 0) ctx.rotate(s.rotation);
    if (s.flipX) ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, sw, sh, -s.width / 2, -s.height / 2, s.width, s.height);
    ctx.restore();
  } else {
    ctx.drawImage(src, 0, 0, sw, sh, s.x - s.width / 2, s.y - s.height / 2, s.width, s.height);
  }
}

/**
 * Pooled offscreen tint buffer, grown to fit the largest frame seen. Reused
 * across sprites/frames so per-sprite tinting allocates nothing steady-state.
 * Returns null when no offscreen 2D context is available (e.g. jsdom tests),
 * in which case callers fall back to an untinted draw.
 */
let tintCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let tintCtx: Ctx2D | null = null;
function tintBuffer(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx2D } | null {
  if (
    tintCanvas === null ||
    tintCanvas.width < w ||
    tintCanvas.height < h
  ) {
    try {
      tintCanvas = createOffscreen(Math.max(w, tintCanvas?.width ?? 0), Math.max(h, tintCanvas?.height ?? 0));
    } catch {
      return null;
    }
    tintCtx = (tintCanvas.getContext("2d") as Ctx2D | null) ?? null;
  }
  if (tintCtx === null) return null;
  return { canvas: tintCanvas, ctx: tintCtx };
}

/** Offscreen surface for the static layer: prefer OffscreenCanvas, fall back
 *  to a detached <canvas> (older browsers / jsdom). */
export function createOffscreen(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
