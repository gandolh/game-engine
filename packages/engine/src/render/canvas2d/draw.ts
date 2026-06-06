import type { LoadedAtlasImage } from "../../assets/loader";
import type { Canvas2dSprite, Ctx2D } from "./types";

/** Stable sort comparator: layer ascending, then Y ascending.
 *  JS Array.sort is guaranteed stable (ES2019+), so equal-key sprites
 *  retain their insertion order — no index tiebreaker needed. */
export function compareSprite(a: Canvas2dSprite, b: Canvas2dSprite): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  return a.y - b.y;
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
