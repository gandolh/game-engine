// Source-hash manifest for the artifact-drift check (audit-29).
//
// Records a sha256 of each src/*.ts kernel as of the last successful
// `npm run build -w @engine/wasm-modules`, committed beside the compiled
// artifacts at dist/manifest.json. build/check-drift.mjs recomputes the
// current source hashes and fails if they no longer match -- catching a
// src/*.ts edit that was never followed by a rebuild.
//
// This file only computes/reads/writes the manifest. It never touches the
// .wasm/.wat binaries themselves -- compile.mjs (the build step) is the only
// thing that writes into dist/.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { kernelSources, pkgRoot } from "./sources.mjs";

export const manifestPath = resolve(pkgRoot, "dist/manifest.json");

async function sha256File(path) {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
}

/** @returns {Promise<Record<string,string>>} kernel name -> sha256 of its src/*.ts */
export async function computeSourceHashes() {
  const sources = await kernelSources();
  const hashes = {};
  for (const { name, path } of sources) {
    hashes[name] = await sha256File(path);
  }
  return hashes;
}

/** Recompute source hashes and write dist/manifest.json. Called by compile.mjs after a build. */
export async function writeManifest() {
  const sources = await computeSourceHashes();
  const manifest = {
    // eslint-disable-next-line
    _comment:
      "sha256 of each engine/wasm-modules/src/*.ts kernel, recorded by build/compile.mjs " +
      "at the end of a successful build. build/check-drift.mjs recomputes these and fails " +
      "if a source file changed without a rebuild. Regenerated automatically -- do not hand-edit.",
    sources,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** @returns {Promise<{sources: Record<string,string>}>} */
export async function readManifest() {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}
