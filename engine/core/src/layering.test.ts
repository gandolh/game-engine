import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
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

/**
 * Every import specifier on a line, package or relative.
 *
 * audit-51's second gap: `forbiddenImport` only matches PACKAGE specifiers, so a relative
 * climb into another game — `import { x } from "../../../hollow/sim-core/src/needs"` inside
 * Citadel — never matched, TypeScript resolved it happily on disk, and the locked convention was
 * broken with CI green.
 */
const SPECIFIER_RE = /(?:from\s+|import\(\s*|require\(\s*)["']([^"']+)["']/g;

/** Longest-prefix scope lookup for a repo-relative path, or `undefined` if outside every scope. */
function scopeOfPath(rel: string): { root: string; game: Game | null } | undefined {
  let best: { root: string; game: Game | null } | undefined;
  for (const s of SCOPES) {
    if ((rel === s.root || rel.startsWith(`${s.root}/`)) && (best === undefined || s.root.length > best.root.length)) {
      best = s;
    }
  }
  return best;
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
          const owner = game ?? "the engine";
          if (pattern.test(line)) {
            violations.push(`${rel}:${i + 1} (${owner} may not import @${forbidden.join("/@")}) ${line.trim()}`);
          }
          // RELATIVE specifiers: resolve them on disk and see which scope they land in, rather
          // than pattern-matching `../` chains. Resolution is exact, so within-game relative
          // imports (which are everywhere) cannot produce a false positive, and a tool reaching
          // into the game it drives stays legal because the scopes agree.
          for (const m of line.matchAll(SPECIFIER_RE)) {
            const spec = m[1]!;
            if (!spec.startsWith(".")) continue;
            const targetRel = relative(REPO_ROOT, resolve(dirname(file), spec)).split(sep).join("/");
            if (targetRel.startsWith("..")) continue; // outside the repo entirely
            const target = scopeOfPath(targetRel);
            if (target === undefined) continue; // outside every scanned scope
            if (target.game === game) continue; // same game (or engine→engine)
            if (target.game === null) continue; // ANY scope may import the engine — that is the rule
            violations.push(
              `${rel}:${i + 1} (${owner} may not reach into @${target.game} by RELATIVE path) ${line.trim()}`,
            );
          }
        });
    }
  }

  it("scans every declared scope, and every declared scope is non-empty", () => {
    // Cheap tripwire: if a rename empties a scope, the guard must fail loudly
    // rather than silently pass on nothing.
    expect(scanned.length).toBeGreaterThan(500);
    for (const { root } of SCOPES) {
      expect(scanned.some((f) => f.startsWith(`${root}/`)), `scope "${root}" scanned no files`).toBe(true);
    }
  });

  // audit-51: the tripwire above only ever checked what it was already told about. `SCOPES` is a
  // hand-written literal, so a fifth game or a new tool was simply never scanned — and
  // `scanned.length > 500` still passed on the other nine roots. This repo went from two games to
  // four, so a fifth is not hypothetical.
  //
  // ENUMERATE FROM DISK and require a classification. That inverts the failure mode from
  // "silently unscanned" to "loudly unclassified", which is the entire point of a guard.
  it("every workspace on disk is classified in SCOPES", () => {
    const declared = new Set(SCOPES.map((s) => s.root));
    const missing: string[] = [];

    const dirsIn = (rel: string): string[] => {
      const abs = join(REPO_ROOT, rel);
      if (statSync(abs, { throwIfNoEntry: false })?.isDirectory() !== true) return [];
      return readdirSync(abs).filter(
        (n) => !SKIP_DIRS.has(n) && statSync(join(abs, n), { throwIfNoEntry: false })?.isDirectory() === true,
      );
    };

    for (const game of dirsIn("games")) {
      if (!declared.has(`games/${game}`)) {
        missing.push(
          `games/${game} — add { root: "games/${game}", game: "${game}" } to SCOPES, and "${game}" to GAMES`,
        );
      }
    }
    for (const tool of dirsIn("tools")) {
      if (!declared.has(`tools/${tool}`)) {
        missing.push(
          `tools/${tool} — add { root: "tools/${tool}", game: <the game it drives, per its package.json> } to SCOPES`,
        );
      }
    }
    if (!declared.has("engine")) missing.push('engine — add { root: "engine", game: null } to SCOPES');

    expect(
      missing,
      missing.length
        ? `\nUnclassified workspace(s) — the layering guard is NOT scanning them:\n  ${missing.join("\n  ")}\n`
        : "",
    ).toEqual([]);
  });

  // The other half of the same idea: a game directory on disk that nobody added to GAMES would be
  // scanned but never FORBIDDEN, so no other game could be caught importing it.
  it("every game directory on disk is a member of GAMES", () => {
    const abs = join(REPO_ROOT, "games");
    const onDisk = readdirSync(abs).filter(
      (n) => !SKIP_DIRS.has(n) && statSync(join(abs, n), { throwIfNoEntry: false })?.isDirectory() === true,
    );
    expect([...onDisk].sort()).toEqual([...GAMES].sort());
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
