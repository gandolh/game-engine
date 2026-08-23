import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Repo-wide dependency-rule guard (locked convention, CLAUDE.md): the engine never
// imports a game, and no game imports another game. Path-scoped, exactly like the
// palette guard in render/ — this file lives in @engine/core but only *reads* game
// sources as text, so the engine still imports nothing.
//
// Supersedes the Hollow-only guard (games/hollow/sim-core/src/layering.test.ts,
// removed 2026-08-23), which left Farm, Citadel and MateQuest enforced by review
// alone — the corpus and CLAUDE.md had been claiming full coverage since.

const HERE = fileURLToPath(new URL(".", import.meta.url));
// HERE = <repo>/engine/core/src/ — three levels up is the repo root.
const REPO_ROOT = join(HERE, "..", "..", "..");

const GAMES = ["farm", "citadel", "hollow", "mathquest"] as const;
type Game = (typeof GAMES)[number];

// Every source root and the game scope it belongs to (`null` = the engine, which may
// import no game at all). Tools inherit the scope of the game they drive — see each
// tool's package.json dependencies.
const SCOPES: ReadonlyArray<{ root: string; game: Game | null }> = [
  { root: "engine", game: null },
  { root: "games/farm", game: "farm" },
  { root: "tools/run-sim", game: "farm" },
  { root: "tools/world-preview", game: "farm" },
  { root: "tools/atlas-builder", game: "farm" },
  { root: "games/citadel", game: "citadel" },
  { root: "tools/citadel-sim", game: "citadel" },
  { root: "games/hollow", game: "hollow" },
  { root: "tools/hollow-sim", game: "hollow" },
  { root: "games/mathquest", game: "mathquest" },
];

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".turbo"]);
const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs)$/;
// This file names every scope in its own patterns, so it cannot scan itself.
const SELF = "engine/core/src/layering.test.ts";

/** Static `from "@x/…"` and dynamic `import("@x/…")` against any of `scopes`. */
function forbiddenImport(scopes: readonly string[]): RegExp {
  const alt = scopes.join("|");
  return new RegExp(`(?:from\\s+|import\\(\\s*)["']@(?:${alt})/`);
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name)) out.push(full);
  }
}

describe("layering — the engine imports no game, and no game imports another game", () => {
  const scanned: string[] = [];
  const violations: string[] = [];

  for (const { root, game } of SCOPES) {
    const abs = join(REPO_ROOT, root);
    if (statSync(abs, { throwIfNoEntry: false })?.isDirectory() !== true) continue;

    const forbidden = GAMES.filter((g) => g !== game);
    const pattern = forbiddenImport(forbidden);
    const files: string[] = [];
    walk(abs, files);

    for (const file of files) {
      const rel = relative(REPO_ROOT, file).split(sep).join("/");
      if (rel === SELF) continue;
      scanned.push(rel);
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (pattern.test(line)) {
            const owner = game ?? "the engine";
            violations.push(`${rel}:${i + 1} (${owner} may not import @${forbidden.join("/@")}) ${line.trim()}`);
          }
        });
    }
  }

  it("scans every game, tool and engine source file", () => {
    // Cheap tripwire: if a rename empties a scope, the guard must fail loudly
    // rather than silently pass on nothing.
    expect(scanned.length).toBeGreaterThan(500);
    for (const { root } of SCOPES) {
      expect(scanned.some((f) => f.startsWith(`${root}/`))).toBe(true);
    }
  });

  it("has no cross-scope imports", () => {
    expect(
      violations,
      violations.length
        ? `\nDependency-rule violations:\n  ${violations.join("\n  ")}\n`
        : "",
    ).toEqual([]);
  });
});
