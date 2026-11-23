import type { UIQuad } from "@engine/core/render";
import type { UISurface } from "../render/ui-surface";
import { frameNameFor } from "./font";
import { fontAtlasId } from "./fonts";
import { layoutText, type TextLayout, type TextLayoutOptions } from "./layout";

/**
 * Screen-space text drawing for `@engine/ui`.
 *
 * `drawText` lays the string out (with optional word-wrap), then emits one tinted UI quad
 * per visible glyph through the Chunk-1 seam (`UISurface.sprite` → `pushUI`). Glyphs are
 * white/alpha masks in the baked font atlas; the `color` tint multiplies them to a palette
 * colour via the textured-quad tint path in `ui-draw.ts`. Whitespace emits no quad.
 *
 * The font atlas for `opts.font` (default the body font) must already be registered on the
 * renderer (`renderer.addAtlas(await loadFontAtlas(font))`) before drawing.
 */

export interface DrawTextOptions extends TextLayoutOptions {
  /** Glyph tint colour. MUST be a palette hex (`EDG.*` / `CITADEL_PAL.*`). */
  color: string;
  /** Per-quad opacity in [0,1]. Default 1. */
  alpha?: number;
}

/**
 * Compute the glyph quads for `text` anchored at top-left (`x`,`y`) without drawing — the
 * shared core of {@link drawText}, exposed so callers/tests can inspect exact positions
 * and counts. Returns one textured quad per visible (non-space) glyph plus the layout.
 */
export function layoutTextQuads(
  text: string,
  x: number,
  y: number,
  opts: DrawTextOptions,
): { quads: UIQuad[]; layout: TextLayout } {
  const quads: UIQuad[] = [];
  const alpha = opts.alpha ?? 1;
  const layout = emitGlyphs(text, x, y, opts, (qx, qy, width, height, atlasId, frame) =>
    quads.push({ x: qx, y: qy, width, height, atlasId, frame, color: opts.color, alpha }),
  );
  return { quads, layout };
}

function emitGlyphs(
  text: string,
  x: number,
  y: number,
  opts: DrawTextOptions,
  emit: (x: number, y: number, width: number, height: number, atlasId: string, frame: string) => void,
): TextLayout {
  const layout = layoutText(text, opts);
  const font = layout.font;
  const m = font.metrics;
  const scale = layout.scale;
  const glyphW = m.glyphWidth * scale;
  const glyphH = m.glyphHeight * scale;
  const advance = m.advance * scale;
  const atlasId = fontAtlasId(font);

  for (let li = 0; li < layout.lines.length; li += 1) {
    const line = layout.lines[li]!.text;
    const lineY = y + li * layout.lineHeight;
    let penX = x;
    for (const ch of line) {
      // Whitespace advances the pen but draws nothing.
      if (ch !== " ") {
        emit(penX, lineY, glyphW, glyphH, atlasId, frameNameFor(ch));
      }
      penX += advance;
    }
  }
  return layout;
}

/**
 * Draw `text` at top-left (`x`,`y`) in screen pixels, tinted `opts.color`, wrapped to
 * `opts.maxWidth` if given. Returns the resolved layout (line breaks + block size) so the
 * caller can position adjacent UI. The surface's `begin()` must already be open.
 */
export function drawText(surface: UISurface, text: string, x: number, y: number, opts: DrawTextOptions): TextLayout {
  const color = opts.color;
  const alpha = opts.alpha ?? 1;
  return emitGlyphs(text, x, y, opts, (qx, qy, width, height, atlasId, frame) =>
    surface.quad(qx, qy, width, height, atlasId, frame, color, alpha),
  );
}
