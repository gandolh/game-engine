import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Guard for the sweep-07 decision (corpus/wiki/decisions.md — Build & verify gates): every
// game client's Vite `build.target` must track tsconfig.base.json's `"target": "ES2022"`
// ("es2022" here), not drift to `"esnext"` (a moving target that silently narrows browser
// support on every esbuild upgrade — a parse failure is a blank page). Path-scoped read-off-disk
// guard, same house pattern as layering.test.ts and the palette/GLSL scans: it discovers the
// configs by globbing rather than hard-coding paths, so a fifth game is caught by the count
// tripwire below instead of silently going unscanned.

const HERE = fileURLToPath(new URL(".", import.meta.url));
// HERE = <repo>/engine/core/src/ — three levels up is the repo root.
const REPO_ROOT = join(HERE, "..", "..", "..");

const EXPECTED_TARGET = "es2022";
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".turbo"]);

// Glob for games/<game>/client/vite.config.ts, reading games/ off disk rather than hard-coding names.
function findGameViteConfigs(): string[] {
  const gamesDir = join(REPO_ROOT, "games");
  const found: string[] = [];
  if (statSync(gamesDir, { throwIfNoEntry: false })?.isDirectory() !== true) return found;

  for (const game of readdirSync(gamesDir)) {
    if (SKIP_DIRS.has(game)) continue;
    const configPath = join(gamesDir, game, "client", "vite.config.ts");
    if (statSync(configPath, { throwIfNoEntry: false })?.isFile() === true) {
      found.push(configPath);
    }
  }
  return found;
}

describe("build target — every game client's Vite build.target tracks tsconfig.base.json", () => {
  const configs = findGameViteConfigs();

  it("finds at least 4 client vite.config.ts files (a broken glob must fail loudly)", () => {
    expect(
      configs.length,
      `Expected to find >= 4 files at games/*/client/vite.config.ts, found ${configs.length}: ` +
        `[${configs.join(", ")}]. Either games/*/client/vite.config.ts moved, or the glob in ` +
        `build-target.test.ts is broken — this must fail loudly, not pass on nothing.`,
    ).toBeGreaterThanOrEqual(4);
  });

  it("every client vite.config.ts sets build.target to the agreed value", () => {
    const violations: string[] = [];

    for (const configPath of configs) {
      const rel = configPath.slice(REPO_ROOT.length + 1);
      const source = readFileSync(configPath, "utf8");

      // Scope the search to the `build: { … }` block. A bare /target\s*:\s*"…"/ over the whole
      // file reads the FIRST quoted `target:`, which in Farm's and Citadel's configs is the dev
      // proxy's upstream URL, not build.target — it only happens to miss today because both write
      // that as `process.env.X ?? "ws://…"` rather than a plain string. Write the proxy target as a
      // literal and an unscoped regex would validate the wrong field and still pass.
      const buildIdx = source.search(/\bbuild\s*:\s*\{/);
      if (buildIdx === -1) {
        violations.push(`${rel}: no \`build: {\` block found (expected build.target "${EXPECTED_TARGET}")`);
        continue;
      }
      const match = /target\s*:\s*["']([^"']+)["']/.exec(source.slice(buildIdx));

      if (!match) {
        violations.push(`${rel}: no build.target found (expected "${EXPECTED_TARGET}")`);
        continue;
      }
      const found = match[1];
      if (found !== EXPECTED_TARGET) {
        violations.push(`${rel}: build.target is "${found}", expected "${EXPECTED_TARGET}"`);
      }
    }

    expect(
      violations,
      violations.length
        ? `\nbuild.target drift — must match tsconfig.base.json's ES2022 (see corpus/wiki/decisions.md):\n  ${violations.join("\n  ")}\n`
        : "",
    ).toEqual([]);
  });
});
