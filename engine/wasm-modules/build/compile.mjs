// Compile every AssemblyScript module under src/ to dist/, then copy the
// resulting .wasm binaries into the farm client's public/wasm so the game can
// fetch them at /wasm/<name>.wasm.
//
// The build is ALL-OR-NOTHING, and that is load-bearing (audit-37). Both output
// locations are tracked in git, so a build that wrote some kernels and then
// failed would leave modified binaries in the working tree while skipping
// writeManifest() -- and audit-29's drift guard could not see it: the recorded
// source hashes still match (the manifest was never rewritten) and the two
// locations still agree (both got the same partial run). Measured before the
// fix: one kernel failing for a reason unrelated to its source left 8 tracked
// binaries dirty and `check-drift` still exited 0.
//
// So every kernel is compiled into a throwaway staging directory first, and
// nothing is copied into dist/ or public/wasm until all of them have succeeded.
// A failed build leaves both tracked locations byte-for-byte untouched.

import { mkdir, mkdtemp, readdir, copyFile, rm } from "node:fs/promises";
import { resolve, dirname, basename, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import asc from "assemblyscript/asc";
import { writeManifest } from "./manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const srcDir = resolve(pkgRoot, "src");
const distDir = resolve(pkgRoot, "dist");
const publicWasmDir = resolve(pkgRoot, "../../games/farm/client/public/wasm");

const entries = (await readdir(srcDir)).filter((f) => f.endsWith(".ts"));
if (entries.length === 0) {
  console.error("No AssemblyScript sources found in", srcDir);
  process.exit(1);
}

// Staging lives outside the repo so a crashed build cannot leave anything
// behind for git (or a later build) to trip over.
const stagingDir = await mkdtemp(join(tmpdir(), "engine-wasm-build-"));

let failed = false;
const built = [];
try {
  for (const entry of entries) {
    const name = basename(entry, ".ts");
    const srcPath = resolve(srcDir, entry);
    const wasmOut = join(stagingDir, `${name}.wasm`);
    const watOut = join(stagingDir, `${name}.wat`);

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
    built.push({ name, wasmOut, watOut });
  }

  if (failed) {
    console.error(
      `[asc] build failed -- dist/ and games/farm/client/public/wasm/ left untouched ` +
        `(${built.length}/${entries.length} kernel(s) compiled, none published).`,
    );
    process.exit(1);
  }

  // Every kernel compiled. Only now touch the two tracked locations.
  await mkdir(distDir, { recursive: true });
  await mkdir(publicWasmDir, { recursive: true });
  for (const { name, wasmOut, watOut } of built) {
    await copyFile(wasmOut, resolve(distDir, `${name}.wasm`));
    await copyFile(watOut, resolve(distDir, `${name}.wat`));
    const dest = resolve(publicWasmDir, `${name}.wasm`);
    await copyFile(wasmOut, dest);
    console.log(`[asc] staged -> ${dest}`);
  }
} finally {
  await rm(stagingDir, { recursive: true, force: true });
}

// Record the source hash each kernel was just built from, so
// build/check-drift.mjs (audit-29) can catch a src/*.ts edit that never got
// rebuilt. Only runs after every kernel compiled AND published successfully.
await writeManifest();
console.log(`[asc] wrote ${resolve(distDir, "manifest.json")}`);
