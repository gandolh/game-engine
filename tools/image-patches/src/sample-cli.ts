/**
 * Write the generated EDG32 sample painted image:
 *
 *   npm run sample -w @tool/image-patches -- <out.png> [<width> <height>]
 */
import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { makeSamplePng } from "./sample";

const [out, w, h] = process.argv.slice(2);
if (!out) {
  console.error("usage: sample <out.png> [<width> <height>]");
  process.exit(2);
}
const png = makeSamplePng(Number(w ?? 5000), Number(h ?? 3000));
writeFileSync(out, PNG.sync.write(png));
console.log(`${out}: ${png.width}×${png.height}`);
