import { DISPLAY_FONT, glyphRows } from "@engine/ui";

/**
 * Which pixels of `text` are lit in the engine's UNSCII display font (8×16 cells, one pixel of
 * tracking), the same glyphs the games draw their in-canvas UI with. Pure, so it is tested.
 */
export function pixelTextBitmap(text: string): { width: number; height: number; lit: Uint8Array } {
  const m = DISPLAY_FONT.metrics;
  const chars = [...text];
  const width = Math.max(1, chars.length * m.advance - m.tracking);
  const height = m.glyphHeight;
  const lit = new Uint8Array(width * height);
  chars.forEach((ch, i) => {
    const rows = glyphRows(DISPLAY_FONT, ch);
    const x0 = i * m.advance;
    for (let y = 0; y < height; y++) {
      const bits = rows[y] ?? 0;
      for (let x = 0; x < m.glyphWidth; x++) {
        if (bits & (0x80 >> x)) lit[y * width + x0 + x] = 1;
      }
    }
  });
  return { width, height, lit };
}

/**
 * A heading drawn in the display font at a whole-number `scale`, as a canvas. The text is also
 * the canvas's `aria-label`; callers keep it in the DOM too.
 */
export function pixelHeading(text: string, scale: number, color: string): HTMLCanvasElement {
  const { width, height, lit } = pixelTextBitmap(text);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.className = "pixel-text";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (lit[y * width + x]) ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
  return canvas;
}
