/**
 * audit-40 — the wasm the sim server reads must survive the Docker build context.
 *
 * `.dockerignore`'s `**` + `/dist` rule matched `engine/wasm-modules/dist/`, the CANONICAL, TRACKED
 * home of `pathfinding.wasm` — while `infrastructure/Dockerfile`'s own header asserted the opposite
 * ("the committed wasm artifacts ... ride along with the source"). Two committed files disagreed,
 * and the runtime resolved it by warning once on stdout and serving a sim whose farmers could never
 * move, under a process compose reported as healthy.
 *
 * WHY THIS IS A TEST AND NOT AN IMAGE BUILD: nothing in this repo's gates builds the container. That
 * is the root cause. `npm run gates` (scripts/gates.mjs) runs typecheck, tests, a build and four
 * startup smokes, and not one of them touches the image — so the only signal this bug ever produced
 * was a log line nobody reads. A real `docker build` is the stronger check, and the Dockerfile now
 * carries a `RUN test -f` that fails the build outright, but that check only fires where a Docker
 * daemon exists, which is NOT here (and, since 2026-09-19, not in a hosted CI either — the GitHub
 * Actions workflow was removed). This test needs no daemon, runs in milliseconds with the rest of the
 * suite, and catches the `.dockerignore` half directly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");
const IGNORE = readFileSync(join(REPO_ROOT, ".dockerignore"), "utf8");
const DOCKERFILE = readFileSync(join(REPO_ROOT, "infrastructure", "Dockerfile"), "utf8");

/** Patterns in file order, comments and blanks stripped. */
function patterns(): string[] {
  return IGNORE.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
}

/**
 * Docker's ignore matching, faithfully enough for these rules: patterns are tested in order and the
 * LAST one that matches decides, with a leading `!` meaning "keep". A pattern also matches anything
 * beneath a directory it matches.
 */
function toRegExp(pat: string): RegExp {
  // Tokenised, NOT a chain of string replaces — a chain corrupts itself, because the `.*` a `**`
  // expands to contains a `*` that the next replace then mangles.
  let out = "^";
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i]!;
    if (c === "*") {
      if (pat[i + 1] === "*") {
        // `**/` spans any number of path segments (including none); a bare `**` spans anything.
        if (pat[i + 2] === "/") { out += "(?:[^/]+/)*"; i += 2; }
        else { out += ".*"; i += 1; }
      } else {
        out += "[^/]*"; // a single `*` stops at a separator
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  // A pattern that matches a directory also matches everything beneath it.
  return new RegExp(out + "(?:/.*)?$");
}

function isExcluded(path: string): boolean {
  let excluded = false;
  for (const raw of patterns()) {
    const negate = raw.startsWith("!");
    const pat = negate ? raw.slice(1) : raw;
    if (toRegExp(pat).test(path)) excluded = !negate;
  }
  return excluded;
}

describe("the .dockerignore matcher itself behaves (so the assertions below mean something)", () => {
  it("still excludes what it is supposed to exclude", () => {
    expect(isExcluded("node_modules")).toBe(true);
    expect(isExcluded("games/farm/client/node_modules/x.js")).toBe(true);
    expect(isExcluded("engine/core/dist/index.js")).toBe(true);
    expect(isExcluded("README.md")).toBe(true);
    expect(isExcluded(".env")).toBe(true);
  });

  it("does not exclude ordinary source", () => {
    expect(isExcluded("games/farm/server/src/index.ts")).toBe(false);
    expect(isExcluded("engine/core/src/index.ts")).toBe(false);
    expect(isExcluded("package.json")).toBe(false);
  });
});

describe("the wasm the sim server reads survives the build context (audit-40)", () => {
  // The exact path `games/farm/server/src/index.ts` resolves at startup.
  const REQUIRED = "engine/wasm-modules/dist/pathfinding.wasm";

  it("the artifact exists and is tracked in the first place", () => {
    expect(existsSync(join(REPO_ROOT, REQUIRED))).toBe(true);
  });

  it("is NOT excluded from the Docker build context", () => {
    expect(
      isExcluded(REQUIRED),
      `${REQUIRED} is excluded by .dockerignore. The container will start, warn once, and then ` +
        `serve a sim with no TravelSystem — farmers never move and it looks dormant, not broken.`,
    ).toBe(false);
  });

  it("neither is the directory itself", () => {
    expect(isExcluded("engine/wasm-modules/dist")).toBe(false);
  });

  it("covers the sibling kernels too, not just the pathfinder", () => {
    for (const f of ["noise.wasm", "rng.wasm", "floodfill.wasm", "manifest.json"]) {
      expect(isExcluded(`engine/wasm-modules/dist/${f}`), f).toBe(false);
    }
  });

  it("every OTHER dist/ is still excluded — the negation is scoped, not a blanket un-ignore", () => {
    for (const d of ["engine/core/dist/index.js", "engine/ui/dist/index.js", "docs/dist/index.html"]) {
      expect(isExcluded(d), d).toBe(true);
    }
  });
});

describe("the Dockerfile's claim is enforced, not merely asserted", () => {
  it("fails the build if the artifact is missing from the context", () => {
    // A comment cannot fail. This is what makes the header's claim true.
    expect(DOCKERFILE).toMatch(/RUN test -f engine\/wasm-modules\/dist\/pathfinding\.wasm/);
  });

  it("the check runs in the stage that actually ships the source", () => {
    const prod = DOCKERFILE.slice(DOCKERFILE.indexOf("AS prod"));
    expect(prod).toContain("RUN test -f engine/wasm-modules/dist/pathfinding.wasm");
    // ...and after the COPY that would bring it in, or it would pass vacuously.
    expect(prod.indexOf("COPY engine ./engine")).toBeLessThan(
      prod.indexOf("RUN test -f engine/wasm-modules/dist/pathfinding.wasm"),
    );
  });
});
