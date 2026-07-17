// Post-emit fixups for the packable dist/ build of @engine/ui.
//
// Why this exists: the ui source uses extensionless, TS-style relative
// imports (a locked repo convention). tsc with moduleResolution "Bundler"
// faithfully preserves those specifiers in the emitted .js/.d.ts, but Node's
// native ESM loader requires explicit file extensions. This script rewrites
// every RESOLVABLE relative specifier to its concrete emitted target
// (`./foo` -> `./foo.js`, a directory `./bar` -> `./bar/index.js`) so the
// tarball is loadable under plain Node ESM without a bundler.
//
// It is intentionally conservative: a specifier is only rewritten when it
// resolves to a real emitted file. Non-resolvable specifiers (e.g. Vite's
// `./shaders/x.wgsl?raw` bundler imports, reached transitively through
// `@engine/core/render`) are left untouched and reported.
//
// It also copies non-TS runtime assets that tsc does not emit. @engine/ui
// has none today (checked: the vendored UNSCII `.hex` fonts under vendor/
// are a dev-time input to tools/hex-to-glyphs.ts, not read by src/ at
// runtime — the generated glyph tables are committed .ts literals that tsc
// already compiles into dist normally). The glob below is kept for parity
// with @engine/core's script and future-proofing; it is a no-op today.
//
// Zero dependencies on purpose — runs on the repo's pinned Node.

import { readdirSync, statSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, relative, posix } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const srcDir = join(pkgRoot, "src");
const distDir = join(pkgRoot, "dist");

if (!existsSync(distDir)) {
  console.error("[postbuild] dist/ not found — did `tsc -p tsconfig.build.json` run?");
  process.exit(1);
}

/** Recursively collect files under `dir` matching `pred`. */
function walk(dir, pred, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, pred, out);
    else if (pred(name)) out.push(full);
  }
  return out;
}

// --- 1. Rewrite relative import/export specifiers to add explicit extensions.
const codeFiles = walk(distDir, (n) => n.endsWith(".js") || n.endsWith(".d.ts"));
// Matches the specifier in: `from "..."`, `import("...")`, and bare `import "..."`.
const SPEC_RE = /((?:\bfrom|\bimport)\s*\(?\s*["'])(\.[^"']*)(["'])/g;

const unresolved = new Set();
let rewrites = 0;

for (const file of codeFiles) {
  const fileDir = dirname(file);
  let changed = false;
  const next = readFileSync(file, "utf8").replace(SPEC_RE, (m, pre, spec, post) => {
    // Already extensioned or carries a query (bundler asset) — leave alone.
    if (spec.endsWith(".js") || spec.includes("?")) return m;
    const abs = join(fileDir, spec);
    if (existsSync(abs + ".js")) {
      changed = true;
      rewrites++;
      return `${pre}${spec}.js${post}`;
    }
    if (existsSync(join(abs, "index.js"))) {
      changed = true;
      rewrites++;
      return `${pre}${spec}/index.js${post}`;
    }
    unresolved.add(`${posix.normalize(relative(distDir, file).split("\\").join("/"))} -> ${spec}`);
    return m;
  });
  if (changed) writeFileSync(file, next);
}

// --- 2. Copy non-TS runtime assets (none today; kept for parity/future-proofing).
let assets = 0;
for (const shader of walk(srcDir, (n) => n.endsWith(".wgsl"))) {
  const dest = join(distDir, relative(srcDir, shader));
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(shader, dest);
  assets++;
}

console.log(`[postbuild] rewrote ${rewrites} relative specifiers across ${codeFiles.length} files; copied ${assets} asset(s).`);
if (unresolved.size > 0) {
  console.log(`[postbuild] left ${unresolved.size} non-resolvable specifier(s) untouched (bundler-only assets, expected):`);
  for (const u of unresolved) console.log(`  - ${u}`);
}
