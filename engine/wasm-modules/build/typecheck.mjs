// Type-check EVERY AssemblyScript kernel under src/.
//
// Was `asc --noEmit src/pathfinding.ts` -- one of four kernels, so a compile
// error in floodfill/noise/rng passed `npm run typecheck` and sat in the tree
// until someone happened to rebuild wasm (which CLAUDE.md says is not required
// after clone). See corpus/todos/2026-09-13-audit-07-wasm-typecheck-all-kernels.md
//
// One `asc` call per file, because the kernels' `alloc`/`free` exports collide
// if bundled into a single program (same reason compile.mjs loops).

import asc from "assemblyscript/asc";
import { kernelSources, configPath } from "./sources.mjs";

const sources = await kernelSources();
let failed = 0;

for (const { file, path } of sources) {
  const { error, stdout, stderr } = await asc.main([
    path,
    "--config", configPath,
    "--noEmit",
  ]);
  if (stdout && stdout.toString().trim()) process.stdout.write(stdout.toString());
  if (stderr && stderr.toString().trim()) process.stderr.write(stderr.toString());
  if (error) {
    console.error(`[asc] typecheck failed: ${file}: ${error.message}`);
    failed += 1;
  }
}

console.log(`[asc] type-checked ${sources.length} kernel(s): ${sources.map((s) => s.file).join(", ")}`);
if (failed > 0) {
  console.error(`[asc] ${failed} kernel(s) failed to type-check`);
  process.exit(1);
}
