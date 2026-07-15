import type { LoadedAtlasImage } from "../assets/loader";
import { createOffscreen } from "./canvas2d/draw";
import type { Ctx2D } from "./canvas2d/types";
import { rgbOf } from "./palette";
import type { UIQuad } from "./renderer";

/**
 * Shared screen-space UI quad rasterizer used by every renderer backend.
 *
 * Both `Canvas2dRenderer` (directly) and `WebGpuRenderer` (via the `Overlay2D`
 * screen-space canvas) drive their UI layer through this single helper so the two
 * backends paint identically. The supplied `ctx` MUST already be in identity
 * (screen) transform; this helper applies its own `dpr` scaling so the caller
 * passes CSS-pixel quad coordinates while the backing store is device pixels.
 *
 * UI draws after the world + wash, so the caller is responsible for ordering.
 * Quads are drawn in submission order with no sorting.
 */
export function drawUIQuad(
  ctx: Ctx2D,
  atlases: Map<string, LoadedAtlasImage>,
  quad: UIQuad,
  dpr: number,
): void {
  const alpha = quad.alpha ?? 1;
  if (alpha <= 0 || quad.width <= 0 || quad.height <= 0) return;

  const dx = quad.x * dpr;
  const dy = quad.y * dpr;
  const dw = quad.width * dpr;
  const dh = quad.height * dpr;

  ctx.globalAlpha = alpha;

  if (quad.atlasId !== undefined && quad.frame !== undefined) {
    const atlas = atlases.get(quad.atlasId);
    if (!atlas) {
      // A textured quad whose atlas isn't loaded is a graceful skip, NOT a throw:
      // throwing here aborts the rest of the frame's UI flush and bubbles into the
      // rAF/tick loop (the world frame was already submitted). Warn once, skip the quad.
      warnMissing(`drawUIQuad: atlas sheet "${quad.atlasId}" not loaded (frame "${quad.frame}")`);
      ctx.globalAlpha = 1;
      return;
    }
    // `frameRect` throws on an unknown frame; probe the manifest first so a missing
    // frame is the same graceful skip as a missing atlas (no throw into the loop).
    if (atlas.manifest.frames[quad.frame] === undefined) {
      warnMissing(`drawUIQuad: frame "${quad.frame}" not in atlas "${quad.atlasId}"`);
      ctx.globalAlpha = 1;
      return;
    }
    const r = atlas.frameRect(quad.frame);

    // Textured-quad tint: glyph/icon atlas frames are baked as white/alpha masks, so a
    // `color` here multiplies the (white) RGB to an EDG32 colour while preserving the
    // frame's own alpha. Mirrors the `drawSprite` multiply→destination-in pattern.
    // White (or no colour) is a no-op, so the common untinted blit skips the buffer.
    const rgb = quad.color !== undefined ? rgbHex(quad.color) : 0xffffff;
    if (rgb !== 0xffffff) {
      const tinted = tintedFrame(atlas, quad.frame, r, rgb);
      if (tinted !== null) {
        // Alpha stays a draw-time ctx.globalAlpha (set above), never baked into the cache.
        ctx.drawImage(tinted, 0, 0, r.w, r.h, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
        return;
      }
      // No offscreen buffer available (rare headless path): fall back to an untinted blit.
    }
    ctx.drawImage(atlas.bitmap, r.x, r.y, r.w, r.h, dx, dy, dw, dh);
  } else if (quad.color !== undefined) {
    ctx.fillStyle = quad.color;
    ctx.fillRect(dx, dy, dw, dh);
  }

  ctx.globalAlpha = 1;
}

// One-time warning per distinct message, so a missing atlas/frame logs once instead of
// flooding the console every frame of the render loop.
const warnedMessages = new Set<string>();
function warnMissing(message: string): void {
  if (warnedMessages.has(message)) return;
  warnedMessages.add(message);
  console.warn(message);
}

/** Packs an EDG hex string (e.g. `#feae34`) into a 24-bit `0xRRGGBB` number. */
function rgbHex(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  return ((r << 16) | (g << 8) | b) >>> 0;
}

// Tint cache (brief 118). A tinted glyph/icon is identical every frame — the UI tree
// re-submits every quad per frame by design, so the multiply→destination-in composite
// used to run per quad per frame (thousands of composite-mode switches under
// endFrame's overlay flush; the 5 fps regression). Cache the composited result per
// (atlas, frame, rgb) and pay one plain drawImage per quad thereafter.
//
// Keyed by the LoadedAtlasImage OBJECT via WeakMap, so replacing an atlas sheet
// (same id, new bake) naturally orphans its stale entries to the GC. Both games run
// fixed palettes (EDG32 / Apollo-46) over small glyph/icon sets, so the per-atlas map
// stays naturally small; the cap is a safety valve that resets the map rather than
// evicting piecemeal (a reset just re-pays one composite per live entry).
const TINT_CACHE_CAP_PER_ATLAS = 4096;
const tintCaches = new WeakMap<LoadedAtlasImage, Map<string, OffscreenCanvas | HTMLCanvasElement>>();

function tintedFrame(
  atlas: LoadedAtlasImage,
  frame: string,
  r: { x: number; y: number; w: number; h: number },
  rgb: number,
): OffscreenCanvas | HTMLCanvasElement | null {
  let cache = tintCaches.get(atlas);
  if (cache === undefined) {
    cache = new Map();
    tintCaches.set(atlas, cache);
  }
  const key = `${frame}/${rgb}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  try {
    canvas = createOffscreen(r.w, r.h);
  } catch {
    return null; // rare headless path: no offscreen canvas available
  }
  const bctx = (canvas.getContext("2d") as Ctx2D | null) ?? null;
  if (bctx === null) return null;

  // Same composite the per-draw path ran (a fresh canvas starts transparent, so no
  // clearRect): source × tint (multiply), masked back to the source alpha.
  bctx.globalAlpha = 1;
  bctx.globalCompositeOperation = "source-over";
  bctx.drawImage(atlas.bitmap, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  bctx.globalCompositeOperation = "multiply";
  bctx.fillStyle = `#${rgb.toString(16).padStart(6, "0")}`;
  bctx.fillRect(0, 0, r.w, r.h);
  bctx.globalCompositeOperation = "destination-in";
  bctx.drawImage(atlas.bitmap, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  bctx.globalCompositeOperation = "source-over";

  if (cache.size >= TINT_CACHE_CAP_PER_ATLAS) cache.clear();
  cache.set(key, canvas);
  return canvas;
}
