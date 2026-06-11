import type { Canvas2dRenderer } from "@engine/core";
import { frameToAtlasId } from "@farm/sim-core/render-systems";

/**
 * Rasterize a single atlas frame to a magnified PNG data URL (nearest-neighbor), so it can be
 * used as an <img>/background icon in the DOM hotbar or as a CSS `cursor: url(...)`. Results are
 * cached per (frame, scale) since atlas pixels never change after load. Returns null when the
 * atlas/frame isn't loaded or canvas APIs are unavailable (e.g. jsdom) — callers fall back to text.
 */
const cache = new Map<string, string | null>();

export function frameDataUrl(
  renderer: Canvas2dRenderer,
  frame: string,
  scale = 2,
): string | null {
  const key = `${frame}@${scale}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const url = rasterize(renderer, frame, scale);
  cache.set(key, url);
  return url;
}

function rasterize(renderer: Canvas2dRenderer, frame: string, scale: number): string | null {
  if (typeof document === "undefined") return null;
  let atlasId: string;
  try {
    atlasId = frameToAtlasId(frame);
  } catch {
    return null;
  }
  const atlas = renderer.getAtlas(atlasId);
  if (!atlas) return null;
  let rect;
  try {
    rect = atlas.frameRect(frame);
  } catch {
    return null;
  }
  const s = Math.max(1, Math.floor(scale));
  const canvas = document.createElement("canvas");
  canvas.width = rect.w * s;
  canvas.height = rect.h * s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas.bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL();
}
