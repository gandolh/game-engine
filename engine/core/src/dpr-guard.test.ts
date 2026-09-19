import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// sweep-06 guard: `devicePixelRatio` must be read in exactly one production
// place — `effectiveDpr()` in engine/core/src/render/dpr.ts — never
// re-derived as a bare `window.devicePixelRatio` (capped or not) anywhere
// else in the engine or a game. See
// corpus/todos/2026-09-19-sweep-06-dpr-cap-duplicated-and-hollow-uncapped.md
// for the seven copies + three uncapped Hollow sites this closed.
//
// Same idiom as render/palette.ts's swatch scan and layering.test.ts's
// import scan: walk the tree as text, ignoring build output.

const HERE = fileURLToPath(new URL(".", import.meta.url));
// HERE = <repo>/engine/core/src/ — three levels up is the repo root.
const REPO_ROOT = join(HERE, "..", "..", "..");

const SCAN_ROOTS = ["engine", "games"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".turbo"]);
const SOURCE_EXT = /\.tsx?$/;

// The one file allowed to read `devicePixelRatio` for real.
const ALLOWED_PRODUCTION_FILE = join("engine", "core", "src", "render", "dpr.ts");
const IS_TEST_FILE = /\.test\.tsx?$/;

// Pre-existing, out-of-scope reads that are NOT a backing-store scaling
// derivation (the thing this sweep centralizes) and so are deliberately not
// routed through effectiveDpr(): a bug-report/profile export that records the
// browser's RAW devicePixelRatio as a diagnostic field, alongside the
// already-capped canvas.width/height, for support triage — capping it would
// throw away the exact information the field exists to capture. Not part of
// sweep-06's evidence table (engine + Citadel + Hollow only) or this sweep's
// file ownership.
const ALLOWED_RAW_READS = new Set<string>([
  join("games", "farm", "client", "src", "main", "profile-export.ts"),
]);

// A line is a comment mention (documentation referring to `devicePixelRatio`
// by name), not a real read, if its trimmed text opens a `//` line comment or
// is inside a `/** ... */` block (`/**`, a continuation `*`, or `*/`).
const COMMENT_LINE = /^(\/\/|\/\*\*|\*\/?)/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name)) out.push(full);
  }
}

describe("devicePixelRatio has exactly one production reader (sweep-06)", () => {
  it("every devicePixelRatio occurrence is either the engine helper, an allowed raw read, or a test that stubs it", () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);

    const offenders: string[] = [];
    for (const file of files) {
      const relNative = relative(REPO_ROOT, file);
      if (relNative === ALLOWED_PRODUCTION_FILE) continue;
      if (ALLOWED_RAW_READS.has(relNative)) continue;
      if (IS_TEST_FILE.test(file)) continue;

      const lines = readFileSync(file, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.includes("devicePixelRatio")) continue;
        if (COMMENT_LINE.test(trimmed)) continue;
        offenders.push(`${relNative.split(sep).join("/")}: ${trimmed}`);
      }
    }

    expect(
      offenders,
      "devicePixelRatio must only be read by effectiveDpr() in " +
        `${ALLOWED_PRODUCTION_FILE.split(sep).join("/")} — every other production ` +
        "site should call effectiveDpr() (from @engine/core/render) instead of " +
        `re-deriving it:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
