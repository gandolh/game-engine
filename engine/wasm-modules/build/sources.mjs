// The kernel source list, derived once and shared by every tool that needs it
// (build/compile.mjs, build/typecheck.mjs, and any artifact-drift check).
//
// Why a shared list: the four kernels each define their own `alloc`/`free`, so
// they CANNOT be handed to one `asc` invocation -- the duplicate exports
// collide. Every consumer therefore compiles one file at a time, and they must
// agree on which files those are.

import { readdir } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const pkgRoot = resolve(__dirname, "..");
export const srcDir = resolve(pkgRoot, "src");
export const configPath = resolve(pkgRoot, "asconfig.json");

/** @returns {Promise<{name: string, file: string, path: string}[]>} */
export async function kernelSources() {
  const files = (await readdir(srcDir)).filter((f) => f.endsWith(".ts")).sort();
  if (files.length === 0) {
    console.error("No AssemblyScript sources found in", srcDir);
    process.exit(1);
  }
  return files.map((file) => ({
    name: basename(file, ".ts"),
    file,
    path: resolve(srcDir, file),
  }));
}
