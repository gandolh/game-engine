/**
 * Inline the evidence PNGs + gamut data into `verify.template.html`, producing a
 * single self-contained page (the Artifact CSP blocks every external request, so
 * nothing may be referenced by URL).
 *
 *   node corpus/verify/2026-07-11-citadel-art/build.mjs
 *
 * Writes `verify.html` next to this script. That file is generated — edit the
 * template, not the output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, "assets");

const png = (file) =>
  `data:image/png;base64,${readFileSync(join(ASSETS, file)).toString("base64")}`;

const SUBSTITUTIONS = {
  __IMG_SPIKE1__: png("spike-1-nearest-colour.png"),
  __IMG_SPIKE2__: png("spike-2-material-ramp.png"),
  __IMG_CURRENT__: png("current-buildings.png"),
  __GAMUT__: readFileSync(join(ASSETS, "gamut.json"), "utf8").trim(),
};

let html = readFileSync(join(HERE, "verify.template.html"), "utf8");
for (const [token, value] of Object.entries(SUBSTITUTIONS)) {
  if (!html.includes(token)) throw new Error(`template is missing the token ${token}`);
  html = html.replace(token, value);
}

const out = join(HERE, "verify.html");
writeFileSync(out, html);
console.log(`wrote ${out} — ${(html.length / 1024).toFixed(0)} KB`);
