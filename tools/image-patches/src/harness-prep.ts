/**
 * Before the harness starts: write the EDG32 sample painted image (5000×3000) and cut it into
 * 2048 px patches under `harness/public/painted/`, unless that is already there.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { makeSamplePng } from "./sample";
import { slicePng } from "./slice";

const out = join("harness", "public", "painted");
if (existsSync(join(out, "patches.json"))) {
  console.log(`${out}: already there`);
} else {
  const { manifest, files } = slicePng(makeSamplePng(5000, 3000));
  mkdirSync(out, { recursive: true });
  for (const f of files) writeFileSync(join(out, f.file), PNG.sync.write(f.png));
  writeFileSync(join(out, "patches.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${out}: ${files.length} patches`);
}
