// Compile every AssemblyScript module under src/ to dist/, then copy the
// resulting .wasm binaries into the farm client's public/wasm so the game can
// fetch them at /wasm/<name>.wasm.

import { mkdir, readdir, copyFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import asc from "assemblyscript/asc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const srcDir = resolve(pkgRoot, "src");
const distDir = resolve(pkgRoot, "dist");
const publicWasmDir = resolve(pkgRoot, "../../games/farm/client/public/wasm");

await mkdir(distDir, { recursive: true });
await mkdir(publicWasmDir, { recursive: true });

const entries = (await readdir(srcDir)).filter((f) => f.endsWith(".ts"));
if (entries.length === 0) {
  console.error("No AssemblyScript sources found in", srcDir);
  process.exit(1);
}

let failed = false;
for (const entry of entries) {
  const name = basename(entry, ".ts");
  const srcPath = resolve(srcDir, entry);
  const wasmOut = resolve(distDir, `${name}.wasm`);
  const watOut = resolve(distDir, `${name}.wat`);

  console.log(`[asc] ${entry} -> dist/${name}.wasm`);
  const { error, stdout, stderr } = await asc.main([
    srcPath,
    "--config", resolve(pkgRoot, "asconfig.json"),
    "--outFile", wasmOut,
    "--textFile", watOut,
  ]);
  if (stdout && stdout.toString().trim()) process.stdout.write(stdout.toString());
  if (stderr && stderr.toString().trim()) process.stderr.write(stderr.toString());
  if (error) {
    console.error(`[asc] failed: ${entry}: ${error.message}`);
    failed = true;
    continue;
  }
  const dest = resolve(publicWasmDir, `${name}.wasm`);
  await copyFile(wasmOut, dest);
  console.log(`[asc] staged -> ${dest}`);
}

if (failed) process.exit(1);
