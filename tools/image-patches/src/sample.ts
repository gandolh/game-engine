import { PNG } from "pngjs";
import { EDG, rgbOf } from "@engine/core/render";

/**
 * A generated painted image on EDG32, for tests and the patch harness: a sky, three hill bands
 * and a sun, with a 1 px checker on every patch-sized block edge, so a seam or an off-by-one at a
 * patch boundary shows as a break in the pattern.
 */
export function makeSamplePng(width: number, height: number, markEvery = 256): PNG {
  const png = new PNG({ width, height });
  const sky = rgbOf(EDG.skyBlue);
  const hills = [rgbOf(EDG.greenMid), rgbOf(EDG.green), rgbOf(EDG.greenDark)];
  const sun = rgbOf(EDG.yellow);
  const mark = [rgbOf(EDG.white), rgbOf(EDG.black)];
  const sunX = width * 0.7;
  const sunY = height * 0.25;
  const sunR = Math.max(4, Math.min(width, height) * 0.08);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = sky;
      if (Math.hypot(x - sunX, y - sunY) < sunR) c = sun;
      for (let band = 0; band < hills.length; band++) {
        const base = height * (0.45 + band * 0.18);
        const crest = base + Math.sin((x / width) * Math.PI * (2 + band) + band) * height * 0.06;
        if (y >= crest) c = hills[band]!;
      }
      if (x % markEvery === 0 || y % markEvery === 0) c = mark[(x + y) % 2]!;
      const i = (y * width + x) * 4;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = 255;
    }
  }
  return png;
}
