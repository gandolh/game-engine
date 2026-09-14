// Artifact-drift check (audit-29): fails if a committed .wasm no longer
// matches the src/*.ts it was built from, or if the two committed artifact
// locations (dist/ and the staged farm-client copy) have drifted apart.
//
// Read-only -- unlike compile.mjs, this script never writes anything. It is
// the `npm run test -w @engine/wasm-modules` entry point so a stale kernel
// fails the normal test run, not just a manual invocation.
//
// Two checks:
//   1. source drift  -- current sha256 of each src/*.ts vs the sha256 recorded
//      in dist/manifest.json the last time the build ran.
//   2. location drift -- dist/<name>.wasm vs games/farm/client/public/wasm/<name>.wasm,
//      which the build stages as a copy and which can drift independently.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { kernelSources, pkgRoot } from "./sources.mjs";
import { computeSourceHashes, readManifest, manifestPath } from "./manifest.mjs";

const distDir = resolve(pkgRoot, "dist");
const publicWasmDir = resolve(pkgRoot, "../../games/farm/client/public/wasm");

async function sha256File(path) {
  try {
    const buf = await readFile(path);
    return createHash("sha256").update(buf).digest("hex");
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

let failed = false;

let manifest;
try {
  manifest = await readManifest();
} catch (err) {
  console.error(`[wasm-drift] cannot read manifest at ${manifestPath}: ${err.message}`);
  console.error(`[wasm-drift] run "npm run build -w @engine/wasm-modules" to (re)generate it.`);
  process.exit(1);
}

const currentSourceHashes = await computeSourceHashes();

for (const [name, hash] of Object.entries(currentSourceHashes)) {
  const recorded = manifest.sources[name];
  if (recorded === undefined) {
    console.error(
      `[wasm-drift] STALE: no manifest entry for kernel "${name}" -- run ` +
        `"npm run build -w @engine/wasm-modules" and commit dist/manifest.json.`,
    );
    failed = true;
    continue;
  }
  if (recorded !== hash) {
    console.error(
      `[wasm-drift] STALE: src/${name}.ts has changed since dist/${name}.wasm was built ` +
        `(manifest sha256 ${recorded.slice(0, 12)}… != current ${hash.slice(0, 12)}…). ` +
        `Run "npm run build -w @engine/wasm-modules" and commit the rebuilt artifacts.`,
    );
    failed = true;
  }
}

for (const name of Object.keys(manifest.sources)) {
  if (!(name in currentSourceHashes)) {
    console.error(
      `[wasm-drift] manifest.json references kernel "${name}" with no matching src/${name}.ts -- ` +
        `stale manifest entry (source was removed or renamed).`,
    );
    failed = true;
  }
}

const sources = await kernelSources();
for (const { name } of sources) {
  const distHash = await sha256File(resolve(distDir, `${name}.wasm`));
  const publicHash = await sha256File(resolve(publicWasmDir, `${name}.wasm`));
  if (distHash === null) {
    console.error(`[wasm-drift] missing dist/${name}.wasm`);
    failed = true;
    continue;
  }
  if (publicHash === null) {
    console.error(`[wasm-drift] missing staged copy games/farm/client/public/wasm/${name}.wasm`);
    failed = true;
    continue;
  }
  if (distHash !== publicHash) {
    console.error(
      `[wasm-drift] LOCATION DRIFT: dist/${name}.wasm and ` +
        `games/farm/client/public/wasm/${name}.wasm differ -- the two committed ` +
        `artifact locations are out of sync. Re-run "npm run build -w @engine/wasm-modules".`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log(
  `[wasm-drift] ${sources.length} kernel(s) match their recorded source hash, and ` +
    `dist/ matches the staged farm-client copy.`,
);
