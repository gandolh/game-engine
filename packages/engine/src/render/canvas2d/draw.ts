import type { LoadedAtlasImage } from "../../assets/loader";
import type { Canvas2dSprite, Ctx2D } from "./types";

/** Layer asc, then Y asc (uses sortY when present). Array.sort is stable (ES2019+) — no tiebreaker needed. */
export function compareSprite(a: Canvas2dSprite, b: Canvas2dSprite): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  return (a.sortY ?? a.y) - (b.sortY ?? b.y);
}

/** AABB overlap of two sprites' drawn rects (centered at x, y−z; width×height). Strict (<,>) so
 *  edge-adjacent tiles don't count. Used by the renderer's x-ray pass to test if an occludable
 *  sprite is covered by one drawn in front of it. */
export function spritesOverlap(a: Canvas2dSprite, b: Canvas2dSprite): boolean {
  const ay = a.z ? a.y - a.z : a.y;
  const by = b.z ? b.y - b.z : b.y;
  return (
    a.x - a.width / 2 < b.x + b.width / 2 &&
    a.x + a.width / 2 > b.x - b.width / 2 &&
    ay - a.height / 2 < by + b.height / 2 &&
    ay + a.height / 2 > by - b.height / 2
  );
}

/** Draw one sprite via the atlas frame rect. Shared by endFrame and bakeStaticLayer — keeps both paths pixel-identical. */
export function drawSprite(ctx: Ctx2D, atlases: Map<string, LoadedAtlasImage>, s: Canvas2dSprite): void {
  const atlas = atlases.get(s.atlasId);
  if (!atlas) throw new Error(`drawSprite: atlas sheet "${s.atlasId}" not loaded (frame "${s.frame}")`);
  const r = atlas.frameRect(s.frame);
  const bitmap = atlas.bitmap;

  // RGB multiply tint: draw onto a pooled offscreen, multiply by tint color,
  // then re-mask with destination-in to prevent bleed into transparent padding.
  // White (0xffffff) is a no-op — skip the offscreen path entirely.
  const tint = (s.tintRgba ?? 0xffffffff) >>> 0;
  const rgb = tint >>> 8; // drop alpha byte; only RGB is used for multiply
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

/** Pooled offscreen tint buffer, grown to fit the largest frame seen (steady-state: zero allocs).
 *  Returns null when no offscreen 2D context is available (e.g. jsdom) — callers fall back to untinted. */
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

/** Prefer OffscreenCanvas; fall back to a detached HTMLCanvasElement (older browsers / jsdom). */
export function createOffscreen(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
