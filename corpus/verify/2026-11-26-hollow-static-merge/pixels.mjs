// usage: node pixels.mjs <a.png> <b.png> <x> <y> <w> <h> [noise.png]
// Counts the pixels of a region that differ between two screenshots: at all, and by more than one level in some
// channel. With a third image of the same scene taken the same way as `a` (another run), it also counts how many of
// the pixels over one level lie more than 12 px from any pixel that differs between `a` and that image: the
// differences that run-to-run noise (agents, the HUD's numbers) does not explain. Reads PNGs with the repo's pngjs.
import { readFileSync } from "node:fs";
import pngjs from "pngjs";
const [a, b, x0, y0, w, h, noisePath] = process.argv.slice(2);
const read = (path) => pngjs.PNG.sync.read(readFileSync(path));
const A = read(a);
const B = read(b);
const N = noisePath ? read(noisePath) : null;
const [X0, Y0, W, H] = [x0, y0, w, h].map(Number);
const diff = (P, Q, i) => Math.max(...[0, 1, 2].map((c) => Math.abs(P.data[i + c] - Q.data[i + c])));
let differ = 0;
const over = [];
const noise = [];
for (let y = Y0; y < Y0 + H; y++) {
  for (let x = X0; x < X0 + W; x++) {
    const i = (y * A.width + x) * 4;
    const d = diff(A, B, i);
    if (d > 0) differ += 1;
    if (d > 1) over.push([x, y]);
    if (N !== null && diff(A, N, i) > 1) noise.push([x, y]);
  }
}
const result = { region: [X0, Y0, W, H], pixels: W * H, differ, differOverOneLevel: over.length };
if (N !== null) {
  const R = 12;
  const unexplained = over.filter(
    ([x, y]) => !noise.some(([nx, ny]) => Math.abs(nx - x) <= R && Math.abs(ny - y) <= R),
  );
  result.noiseOverOneLevel = noise.length;
  result.unexplained = unexplained;
}
console.log(JSON.stringify(result));
