/**
 * Dependency-rule guard (locked convention, CLAUDE.md): `@hollow/*` may depend
 * ONLY on `@engine/*` — never on `@farm/*` or `@citadel/*` (the two games
 * never import each other, and a third game joins the same rule). This scans
 * every Hollow source file (sim-core, client, and the headless tool) rather
 * than just this package, so a violation introduced anywhere under
 * `games/hollow/` or `tools/hollow-sim/` is caught from one place.
 *
 * No repo-wide layering test existed before this chunk (checked
 * engine/core/src/render/palette.test.ts and the workspace package.jsons —
 * the dependency rule was previously enforced only by review, not a test), so
 * this is a new, Hollow-scoped grep guard rather than an extension of an
 * existing one.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
// HERE = <repo>/games/hollow/sim-core/src/ — four levels up is the repo root
// (src -> sim-core -> hollow -> games -> repo root), same depth as the
// engine's own palette.test.ts (engine/core/src/render/ -> repo root).
const REPO_ROOT = join(HERE, "..", "..", "..", "..");

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);
const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs)$/;
const SKIP_FILE = /\.(test|spec)\.(ts|tsx|js)$/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name) && !SKIP_FILE.test(name)) out.push(full);
  }
}

// Matches `from "@farm/..."` / `from '@citadel/...'` (also catches bare
// `import("@farm/...")` dynamic imports since the substring still appears).
const FORBIDDEN_IMPORT = /from\s+["']@(farm|citadel)\/[^"']*["']|import\(\s*["']@(farm|citadel)\/[^"']*["']/;

describe("@hollow/* dependency rule — engine-only, never @farm/* or @citadel/*", () => {
  const roots = ["games/hollow", "tools/hollow-sim"]
    .map((p) => join(REPO_ROOT, p))
    .filter((p) => statSync(p, { throwIfNoEntry: false })?.isDirectory() === true);

  const files: string[] = [];
  for (const r of roots) walk(r, files);

  it("scans a non-trivial number of Hollow source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no Hollow source file imports @farm/* or @citadel/*", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(REPO_ROOT, file).split(sep).join("/");
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (FORBIDDEN_IMPORT.test(line)) {
          violations.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      violations.length
        ? `\nDependency-rule violation — @hollow/* may depend only on @engine/*:\n  ${violations.join("\n  ")}\n`
        : "",
    ).toEqual([]);
  });
});
