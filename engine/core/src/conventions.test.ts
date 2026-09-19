import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Three repo-wide "locked conventions" guards (CLAUDE.md), all currently enforced by
// nothing but comments and reviewer memory (corpus/todos/2026-09-19-sweep-01). Same
// house pattern as the two existing repo-wide guards this file sits beside:
// engine/core/src/layering.test.ts (path-scoped scan, discover-from-disk, loud-not-
// vacuous tripwires) and engine/core/src/render/palette.test.ts (ALLOWLIST with a
// mandatory reason, scanned-file-count tripwire). This file lives in @engine/core but
// only *reads* game/tool sources as text — the engine still imports nothing.

const HERE = fileURLToPath(new URL(".", import.meta.url));
// HERE = <repo>/engine/core/src/ — three levels up is the repo root.
const REPO_ROOT = join(HERE, "..", "..", "..");
const SELF = "engine/core/src/conventions.test.ts";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".turbo"]);

function isDir(abs: string): boolean {
  return statSync(abs, { throwIfNoEntry: false })?.isDirectory() === true;
}

function walk(dir: string, extRe: RegExp, skipRe: RegExp | undefined, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) walk(full, extRe, skipRe, out);
    else if (extRe.test(name) && !(skipRe?.test(name) ?? false)) out.push(full);
  }
}

function relPath(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

/**
 * Strip `//` line comments and `/* *\/` block comments (JSDoc included) out of a
 * source file, replacing their content with spaces so line numbers — and therefore
 * every file:line the scans below report — stay correct. String/template literal
 * contents are tracked separately so a `//` or `/*` inside a quoted string does not
 * flip the scanner into "comment" mode.
 *
 * This is the single most important detail in this file: the repo documents the
 * determinism rule in comments AT the sites it constrains ("no Math.random() is
 * used", "never `Math.random()`/`Date.now()`"), so a naive grep returns a false
 * positive on every one of those comments. Every current Math.random/Date.now match
 * across the four sim-cores today is one of these comments — verified by hand before
 * writing this guard. Strip comments first, or the guard fails immediately on a
 * clean tree.
 *
 * Not a full tokenizer (no regex-literal handling), but sufficient for TypeScript
 * source that doesn't hide banned calls inside a regex literal — none does today.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  type State = "code" | "line-comment" | "block-comment" | "string";
  let state: State = "code";
  let stringChar = "";
  while (i < n) {
    const c = src[i]!;
    const c2 = i + 1 < n ? src[i + 1]! : "";
    if (state === "code") {
      if (c === "/" && c2 === "/") {
        state = "line-comment";
        out += "  ";
        i += 2;
        continue;
      }
      if (c === "/" && c2 === "*") {
        state = "block-comment";
        out += "  ";
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        state = "string";
        stringChar = c;
        out += c;
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    if (state === "line-comment") {
      if (c === "\n") {
        state = "code";
        out += "\n";
        i += 1;
        continue;
      }
      out += " ";
      i += 1;
      continue;
    }
    if (state === "block-comment") {
      if (c === "*" && c2 === "/") {
        state = "code";
        out += "  ";
        i += 2;
        continue;
      }
      out += c === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }
    // state === "string"
    if (c === "\\") {
      out += c + c2;
      i += 2;
      continue;
    }
    if (c === stringChar) {
      state = "code";
      out += c;
      i += 1;
      continue;
    }
    out += c === "\n" ? "\n" : c;
    i += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scan 1: determinism. "All randomness flows through the seeded mulberry32 Rng
// … Never use Math.random() or Date.now() in sim code." (CLAUDE.md)
// ---------------------------------------------------------------------------

// audit-51's lesson (applied here, not just in layering.test.ts): do NOT hand-write
// the list of sim-core roots. Discover every games/*/sim-core/src from disk, and
// assert one root per game directory that actually exists under games/ — a fifth
// game with no scanned sim-core root must fail loudly, naming it, not silently ship
// unguarded.
const GAMES_DIR = join(REPO_ROOT, "games");
const GAME_DIRS_ON_DISK: string[] = isDir(GAMES_DIR)
  ? readdirSync(GAMES_DIR).filter((name) => isDir(join(GAMES_DIR, name)))
  : [];

const SIM_CORE_ROOTS: Array<{ game: string; dir: string }> = [];
const GAMES_MISSING_SIM_CORE: string[] = [];
for (const game of GAME_DIRS_ON_DISK) {
  const dir = join(GAMES_DIR, game, "sim-core", "src");
  if (isDir(dir)) {
    SIM_CORE_ROOTS.push({ game, dir });
  } else {
    GAMES_MISSING_SIM_CORE.push(game);
  }
}

// The engine-side determinism-relevant scopes named explicitly by the spec — these
// are fixed subdirectories of the one engine package, not something to discover a
// list of, unlike the per-game sim-core roots above.
const ENGINE_DETERMINISM_ROOTS = ["sim", "ecs", "runtime"].map((name) => ({
  game: null as string | null,
  dir: join(HERE, name),
}));

const DETERMINISM_ROOTS: Array<{ game: string | null; dir: string }> = [
  ...SIM_CORE_ROOTS,
  ...ENGINE_DETERMINISM_ROOTS,
];

const TEST_FILE_RE = /\.test\.ts$/;
const TS_EXT_RE = /\.ts$/;
const DTS_RE = /\.d\.ts$/;

// Mirrors palette.test.ts's ALLOWLIST_FILES: empty today, and asserted empty below.
// If a legitimate exception is ever needed, it goes here with a written reason —
// never a silent skip.
const ALLOWLIST: Record<string, string> = {};

const BANNED_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "Math.random", re: /\bMath\.random\s*\(/ },
  { name: "Date.now", re: /\bDate\.now\s*\(/ },
  { name: "performance.now", re: /\bperformance\.now\s*\(/ },
  { name: "new Date(", re: /\bnew\s+Date\s*\(/ },
];

describe("determinism — no Math.random/Date.now/performance.now/new Date in sim code", () => {
  const scannedFiles: string[] = [];
  const violations: string[] = [];

  for (const { game, dir } of DETERMINISM_ROOTS) {
    const files: string[] = [];
    walk(dir, TS_EXT_RE, TEST_FILE_RE, files);
    for (const file of files) {
      if (DTS_RE.test(file)) continue; // declaration files carry no runtime code
      const rel = relPath(file);
      if (rel === SELF) continue;
      scannedFiles.push(rel);
      if (ALLOWLIST[rel]) continue;

      const stripped = stripComments(readFileSync(file, "utf8"));
      const lines = stripped.split("\n");
      lines.forEach((line, i) => {
        for (const { name, re } of BANNED_PATTERNS) {
          if (re.test(line)) {
            const owner = game ?? "the engine";
            violations.push(`${rel}:${i + 1} (${owner} may not use ${name}) ${line.trim()}`);
          }
        }
      });
    }
  }

  it("finds a sim-core root for every game directory on disk", () => {
    expect(
      GAMES_MISSING_SIM_CORE,
      GAMES_MISSING_SIM_CORE.length
        ? `\nGame(s) with no games/<game>/sim-core/src found — the determinism guard is NOT ` +
            `scanning them:\n  ${GAMES_MISSING_SIM_CORE.join("\n  ")}\n`
        : "",
    ).toEqual([]);
    // The other half: the discovery must have actually found something, so an empty
    // `games/` (or a broken glob) can't pass this by vacuously finding no games at all.
    expect(
      GAME_DIRS_ON_DISK.length,
      "found zero directories under games/ — the discovery glob is broken",
    ).toBeGreaterThan(0);
    expect(SIM_CORE_ROOTS.length).toBe(GAME_DIRS_ON_DISK.length);
  });

  it("actually reached files — a broken glob must fail loudly, not pass vacuously", () => {
    // audit-44's lesson: assert the scan reached a non-trivial number of files, not
    // just that the violations list is empty (which is also true of a scan that
    // opened nothing at all).
    expect(
      scannedFiles.length,
      `scanned only ${scannedFiles.length} file(s) across ${DETERMINISM_ROOTS.length} ` +
        "determinism root(s) — the walk is not reaching real source; check DETERMINISM_ROOTS " +
        "and the sim-core discovery glob",
    ).toBeGreaterThan(300);
    // And each declared root must individually have contributed at least one file —
    // otherwise one dead root could hide behind the others' totals.
    for (const { game, dir } of DETERMINISM_ROOTS) {
      const owner = game ?? "engine";
      const prefix = relPath(dir);
      expect(
        scannedFiles.some((f) => f.startsWith(`${prefix}/`)),
        `determinism root for ${owner} (${prefix}) scanned no files`,
      ).toBe(true);
    }
  });

  it("the allowlist is empty", () => {
    expect(Object.keys(ALLOWLIST)).toEqual([]);
  });

  it("finds zero uses of a banned nondeterministic call", () => {
    expect(
      violations,
      violations.length
        ? `\nNondeterminism found in sim code — all randomness must flow through the seeded ` +
            `Rng (engine/core/src/runtime/rng.ts) via a named fork(); wall-clock reads are not ` +
            `pacing-only in sim code:\n  ${violations.join("\n  ")}\n`
        : "",
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scan 2: "No .js import suffixes." Extensionless TypeScript-style imports only.
// ---------------------------------------------------------------------------

const IMPORT_SCAN_ROOTS = ["engine", "games", "tools"];
const IMPORT_SOURCE_EXT_RE = /\.(ts|tsx)$/;
// A relative or `@scope/...`/bare specifier ending in a literal `.js` (optionally
// with a query string, as Vite asset imports use) inside a static `from "..."`,
// dynamic `import("...")`, or `require("...")`.
const JS_SUFFIX_IMPORT_RE = /(?:from\s+|import\(\s*|require\(\s*)["']([^"']+\.js)["']/g;

describe("no .js import suffixes in engine/games/tools source", () => {
  const scannedFiles: string[] = [];
  const violations: string[] = [];

  for (const root of IMPORT_SCAN_ROOTS) {
    const abs = join(REPO_ROOT, root);
    if (!isDir(abs)) continue;
    const files: string[] = [];
    walk(abs, IMPORT_SOURCE_EXT_RE, undefined, files);
    for (const file of files) {
      const rel = relPath(file);
      if (rel === SELF) continue;
      scannedFiles.push(rel);
      if (ALLOWLIST[rel]) continue;

      const stripped = stripComments(readFileSync(file, "utf8"));
      const lines = stripped.split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(JS_SUFFIX_IMPORT_RE)) {
          violations.push(`${rel}:${i + 1} (extensionless imports only, no ".js") ${line.trim()}`);
        }
      });
    }
  }

  it("actually reached files — a broken glob must fail loudly, not pass vacuously", () => {
    expect(
      scannedFiles.length,
      `scanned only ${scannedFiles.length} file(s) across ${IMPORT_SCAN_ROOTS.join(", ")} — ` +
        "the walk is not reaching real source",
    ).toBeGreaterThan(1000);
    for (const root of IMPORT_SCAN_ROOTS) {
      expect(
        scannedFiles.some((f) => f.startsWith(`${root}/`)),
        `import-suffix scan root "${root}" scanned no files`,
      ).toBe(true);
    }
  });

  it("finds zero .js-suffixed import specifiers", () => {
    expect(
      violations,
      violations.length
        ? `\n".js" import suffix found — this repo uses extensionless TypeScript-style ` +
            `imports throughout (CLAUDE.md "Locked conventions"):\n  ${violations.join("\n  ")}\n`
        : "",
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scan 3: "Pinned versions. No ^/~ in any package.json." Reproducibility.
// ---------------------------------------------------------------------------

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

// Expand the exact glob shapes used by the root package.json's own "workspaces"
// field (read from disk, not hand-copied) into concrete directories that may hold a
// package.json: a literal directory name, one "*" wildcard segment, or two "*"
// wildcard segments. This is the same discover-from-disk posture as the sim-core
// roots above — if the workspaces field ever grows a new shape, this simply finds
// no matching directories for it rather than silently scanning nothing while
// looking like it worked.
function expandWorkspaceGlob(pattern: string): string[] {
  const parts = pattern.split("/");
  let dirs = [""];
  for (const part of parts) {
    const next: string[] = [];
    for (const d of dirs) {
      const base = d === "" ? REPO_ROOT : join(REPO_ROOT, d);
      if (part === "*") {
        if (!isDir(base)) continue;
        for (const name of readdirSync(base)) {
          if (SKIP_DIRS.has(name)) continue;
          const childRel = d === "" ? name : `${d}/${name}`;
          if (isDir(join(REPO_ROOT, childRel))) next.push(childRel);
        }
      } else {
        const childRel = d === "" ? part : `${d}/${part}`;
        if (isDir(join(REPO_ROOT, childRel))) next.push(childRel);
      }
    }
    dirs = next;
  }
  return dirs;
}

const rootPkgRaw = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
  workspaces?: string[];
};
const WORKSPACE_GLOBS = rootPkgRaw.workspaces ?? [];

describe("pinned versions — no ^/~ ranges in any workspace package.json", () => {
  const workspaceDirs = new Set<string>([""]); // "" = repo root's own package.json
  for (const glob of WORKSPACE_GLOBS) {
    for (const dir of expandWorkspaceGlob(glob)) workspaceDirs.add(dir);
  }

  const packageJsonFiles: string[] = [];
  for (const dir of workspaceDirs) {
    const abs = dir === "" ? join(REPO_ROOT, "package.json") : join(REPO_ROOT, dir, "package.json");
    if (statSync(abs, { throwIfNoEntry: false })?.isFile() === true) {
      packageJsonFiles.push(relPath(abs));
    }
  }

  const violations: string[] = [];
  for (const rel of packageJsonFiles) {
    if (ALLOWLIST[rel]) continue;
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8")) as Record<string, unknown>;
    for (const field of DEPENDENCY_FIELDS) {
      const deps = pkg[field];
      if (deps === undefined || typeof deps !== "object" || deps === null) continue;
      for (const [name, rawValue] of Object.entries(deps as Record<string, unknown>)) {
        const value = String(rawValue);
        if (/^[\^~]/.test(value)) {
          violations.push(`${rel} [${field}] "${name}": "${value}" — pin the exact version`);
        }
      }
    }
  }

  it("discovered a non-empty workspaces field, and reached package.json files from it — a broken glob must fail loudly, not pass vacuously", () => {
    expect(
      WORKSPACE_GLOBS.length,
      'root package.json has no "workspaces" field to discover package.json locations from',
    ).toBeGreaterThan(0);
    expect(
      packageJsonFiles.length,
      `found only ${packageJsonFiles.length} package.json file(s) across the workspace globs ` +
        `${JSON.stringify(WORKSPACE_GLOBS)} — the discovery is not reaching real workspaces`,
    ).toBeGreaterThan(15);
  });

  it("the allowlist is empty", () => {
    expect(Object.keys(ALLOWLIST)).toEqual([]);
  });

  it("finds zero ^/~ dependency ranges", () => {
    expect(
      violations,
      violations.length
        ? `\nUnpinned dependency range(s) found — this repo pins exact versions for ` +
            `reproducibility (CLAUDE.md "Locked conventions"):\n  ${violations.join("\n  ")}\n`
        : "",
    ).toEqual([]);
  });
});
