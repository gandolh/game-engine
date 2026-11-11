/**
 * Cut a painted image into patches for the static layer:
 *
 *   npm start -w @tool/image-patches -- <source.png> <outDir> [--size <px>]
 *
 * Writes `patch-<col>-<row>.png` files and `patches.json` into `outDir`; a client loads them with
 * `loadPatchedImage("<outDir url>/patches.json")` and shows them with `renderer.bakeStaticImage`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { slicePng } from "./slice";

const args = process.argv.slice(2);
const sizeAt = args.indexOf("--size");
const size = sizeAt >= 0 ? Number(args[sizeAt + 1]) : undefined;
const [source, outDir] = args.filter((_, i) => i !== sizeAt && i !== sizeAt + 1);
if (!source || !outDir || (size !== undefined && !(size > 0))) {
  console.error("usage: image-patches <source.png> <outDir> [--size <px>]");
  process.exit(2);
}

const { manifest, files } = slicePng(PNG.sync.read(readFileSync(source)), size);
mkdirSync(outDir, { recursive: true });
for (const f of files) writeFileSync(join(outDir, f.file), PNG.sync.write(f.png));
writeFileSync(join(outDir, "patches.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `${source}: ${manifest.width}×${manifest.height} → ${files.length} patches of ${manifest.patchSize} px in ${outDir}`,
);
