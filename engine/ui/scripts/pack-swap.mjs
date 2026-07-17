// Pack-time manifest swap for @engine/ui.
//
// The tension: ONE package.json serves two audiences.
//   - In the monorepo, every tool (Vite, vitest, tsx, tsc) resolves
//     `@engine/ui/*` straight to the TS SOURCE via the top-level `exports`.
//     This must stay byte-identical to how it worked before packaging existed
//     — zero churn for games/tools.
//   - A tarball consumer must instead resolve the built `dist/` (.js + .d.ts).
//
// npm's `publishConfig` (unlike Yarn's) does NOT override manifest fields such
// as `exports`/`main`/`types` at pack/publish time — it only carries npm CONFIG
// keys (registry/tag/access). Verified empirically with `npm pack` on npm@11.
//
// So we keep the top-level manifest pointing at `src` (dev truth) and, ONLY
// during `npm pack`/`npm publish`, promote the dist manifest held in
// `publishConfig` into the real fields. `postpack` restores the dev manifest.
// The working tree is dev-oriented before and after; the swap window is the
// pack itself.

import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(here, "..", "package.json");
const backupPath = join(here, "..", ".package.json.dev");

const mode = process.argv[2];

function read(path) {
  return readFileSync(path, "utf8");
}
function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

if (mode === "--to-dist") {
  // If a stale backup exists (a previous pack was interrupted), restore first
  // so we always swap from the canonical dev manifest.
  if (existsSync(backupPath)) {
    writeFileSync(pkgPath, read(backupPath));
  }
  const raw = read(pkgPath);
  writeFileSync(backupPath, raw); // exact dev manifest, byte-for-byte
  const pkg = JSON.parse(raw);
  const pub = pkg.publishConfig;
  if (!pub || !pub.exports) {
    console.error("[pack-swap] publishConfig.exports missing — cannot build dist manifest.");
    process.exit(1);
  }
  pkg.main = pub.main;
  pkg.types = pub.types;
  pkg.exports = pub.exports;
  delete pkg.publishConfig; // the tarball manifest doesn't need it
  writeJson(pkgPath, pkg);
  console.log("[pack-swap] promoted dist manifest (exports -> ./dist) for packing.");
} else if (mode === "--restore") {
  if (existsSync(backupPath)) {
    writeFileSync(pkgPath, read(backupPath));
    rmSync(backupPath);
    console.log("[pack-swap] restored dev manifest (exports -> ./src).");
  } else {
    console.log("[pack-swap] no backup found — nothing to restore.");
  }
} else {
  console.error("[pack-swap] usage: pack-swap.mjs --to-dist | --restore");
  process.exit(1);
}
