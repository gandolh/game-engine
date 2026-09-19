import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EDG32,
  EDG32_SET,
  EDG,
  isEdg32,
  nearestEdg32,
  normalizeHex,
  rgbOf,
  APOLLO,
  APOLLO_SET,
  RESURRECT64,
  RESURRECT64_SET,
  nearestSwatch,
} from "./palette";

// sweep-02: the Apollo-46 and Resurrect-64 scan lists used to be inlined here
// (a fifth and third hand-copied literal respectively). Both are now
// exported data from ./palette (imported above), like EDG32 already was —
// the engine test *can* import the engine. The module-backed integrity
// checks — CITADEL_PAL / HOLLOW_PAL ⊆ APOLLO, MATE_PAL ⊆ RESURRECT64, keys ==
// EDG keys — still live in each game's own colocated test (the engine cannot
// import a game), but all three now import the SAME engine-owned list instead
// of each hand-copying it.
const nearestApollo = (hex: string): string => nearestSwatch(hex, APOLLO);
const nearestResurrect64 = (hex: string): string => nearestSwatch(hex, RESURRECT64);

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);
// audit-44: `.html` and `.css` are in scope. CLAUDE.md has always stated the rule as covering
// "sprites, tiles, particles, day/night wash, HTML/canvas UI" — the doc was right and the guard
// was narrower than everyone believed. Behind the gap sat a live violation: Farm's index.html set
// the page background and default text colour, the first thing a player sees, to two hexes in no
// palette at all. Citadel's style.css happened to use valid Apollo swatches; that was luck, not
// enforcement.
const SOURCE_EXT = /\.(ts|js|mjs|cjs|html|css)$/;
const SKIP_FILE = /\.(test|spec)\.(ts|js)$/; 

const ALLOWLIST_FILES: Record<string, string> = {};

// The trailing lookahead rejects any WORD character, not just further hex digits.
// A real colour literal is always followed by a quote, space, semicolon, paren or
// comma — never by a letter. Rejecting only hex was too narrow and matched GLSL
// preprocessor directives: `#define` begins with `#def`, and d/e/f are all valid
// hex digits, so `#define MAX_MATERIALS 256` was reported as an off-palette colour.
// That became reachable once the WebGL2 migration started generating GLSL source
// from TypeScript (render3d/webgl2/renderer3d.ts injects a #define).
const HEX_RE = /#[0-9a-fA-F]{6}(?![0-9a-zA-Z_])|#[0-9a-fA-F]{3}(?![0-9a-zA-Z_])/g;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name) && !SKIP_FILE.test(name)) out.push(full);
  }
}

describe("EDG32 palette is the single source of truth", () => {
  it("has exactly 32 unique colors in canonical order", () => {
    expect(EDG32).toHaveLength(32);
    expect(new Set(EDG32).size).toBe(32);
  });

  it("every named EDG color is one of the 32 swatches", () => {
    for (const [name, hex] of Object.entries(EDG)) {
      expect(EDG32_SET.has(hex), `EDG.${name} (${hex}) not in EDG32`).toBe(true);
    }
  });

  it("isEdg32 / nearestEdg32 behave", () => {
    expect(isEdg32("#63c74d")).toBe(true);
    expect(isEdg32("#63C74D")).toBe(true);
    expect(isEdg32("#123456")).toBe(false);
    expect(nearestEdg32("#63c64c")).toBe("#63c74d");
  });
});

// The Apollo scan list (used for games/citadel/ AND games/hollow/ files —
// both now import this same engine-owned APOLLO rather than hand-copying it,
// sweep-02). The AUTHORITATIVE module-backed integrity checks — CITADEL_PAL /
// HOLLOW_PAL ⊆ APOLLO, keys == EDG keys — live in
// games/citadel/client/src/render/citadel-palette.test.ts and
// games/hollow/client/src/render/hollow-palette.test.ts respectively (the
// engine cannot import a game). These two guard that APOLLO still has the
// expected cardinality from this side too.
describe("Apollo scan list (Citadel + Hollow scope)", () => {
  it("has exactly 46 unique colors", () => {
    expect(APOLLO).toHaveLength(46);
    expect(new Set(APOLLO).size).toBe(46);
  });

  it("nearestApollo behaves", () => {
    expect(nearestApollo("#75a743")).toBe("#75a743");
    expect(nearestApollo("#75A743")).toBe("#75a743");
    expect(nearestApollo("#74a642")).toBe("#75a743");
  });
});

// The Resurrect-64 scan list (MateQuest scope) — same guard shape as the
// Apollo scan list above.
describe("Resurrect-64 scan list (MateQuest scope)", () => {
  it("has exactly 64 unique colors", () => {
    expect(RESURRECT64).toHaveLength(64);
    expect(new Set(RESURRECT64).size).toBe(64);
  });

  it("nearestResurrect64 behaves", () => {
    expect(nearestResurrect64("#91db69")).toBe("#91db69");
    expect(nearestResurrect64("#91DB69")).toBe("#91db69");
    expect(nearestResurrect64("#90da68")).toBe("#91db69");
  });
});

describe("no source file uses an off-palette color literal", () => {
  const files: string[] = [];
  walk(join(REPO_ROOT, "engine"), files);
  walk(join(REPO_ROOT, "games"), files);
  walk(join(REPO_ROOT, "tools"), files);

  // Palette is scoped by path: Citadel source (games/citadel/) and Hollow
  // source (games/hollow/) are validated against Apollo; MateQuest source
  // (games/mathquest/) is validated against Resurrect-64; everything else
  // (Farm + engine + tools) stays on EDG32.
  //
  // sweep-02: `palette.ts` itself is the one exception. It is now the
  // canonical SOURCE of all three named palettes' data (EDG32, APOLLO,
  // RESURRECT64), not just EDG32's — so a hex literal there may legitimately
  // belong to any of the three, and it gets its own scope checked against
  // their union rather than being flagged as an EDG32 violation for
  // containing Apollo/Resurrect-64 swatches.
  const PALETTE_SOURCE_REL = "engine/core/src/render/palette.ts";
  type Scope = "citadel" | "hollow" | "mathquest" | "paletteSource" | "default";
  const scopeOf = (rel: string): Scope => {
    if (rel === PALETTE_SOURCE_REL) return "paletteSource";
    if (rel.startsWith("games/citadel/")) return "citadel";
    if (rel.startsWith("games/hollow/")) return "hollow";
    if (rel.startsWith("games/mathquest/")) return "mathquest";
    return "default";
  };

  const ALL_NAMED_SWATCHES: ReadonlySet<string> = new Set([...EDG32_SET, ...APOLLO_SET, ...RESURRECT64_SET]);

  const violations: string[] = [];
  for (const file of files) {
    const rel = relative(REPO_ROOT, file).split(sep).join("/");
    if (ALLOWLIST_FILES[rel]) continue;
    const scope = scopeOf(rel);
    const usesApollo = scope === "citadel" || scope === "hollow";
    const usesResurrect = scope === "mathquest";
    const allowed =
      scope === "paletteSource" ? ALL_NAMED_SWATCHES : usesApollo ? APOLLO_SET : usesResurrect ? RESURRECT64_SET : EDG32_SET;
    const palName =
      scope === "citadel"
        ? "Apollo (Citadel)"
        : scope === "hollow"
          ? "Apollo (Hollow)"
          : scope === "mathquest"
            ? "Resurrect-64 (MateQuest)"
            : scope === "paletteSource"
              ? "EDG32/Apollo/Resurrect-64 (canonical source)"
              : "EDG32";
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const matches = line.match(HEX_RE);
      if (!matches) return;
      for (const m of matches) {
        if (!allowed.has(normalizeHex(m))) {
          const nearest = usesApollo ? nearestApollo(m) : usesResurrect ? nearestResurrect64(m) : nearestEdg32(m);
          violations.push(
            `${rel}:${i + 1}  ${m.toLowerCase()}  →  expected ${palName}, nearest ${nearest}`,
          );
        }
      }
    });
  }

  it("scans a non-trivial number of source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  // audit-44: a scan that silently matches ZERO files of a type is the exact failure mode this
  // widening exists to remove — the guard was green for months because it never opened these
  // files, not because they were clean. Count them explicitly, in the style of the tripwire above.
  it("actually reaches the HTML and CSS files, not just the TypeScript", () => {
    const html = files.filter((f) => f.endsWith(".html"));
    const css = files.filter((f) => f.endsWith(".css"));
    expect(html.length, "no .html files scanned — the widened scan is not reaching them").toBeGreaterThan(0);
    expect(css.length, "no .css files scanned — the widened scan is not reaching them").toBeGreaterThan(0);
    // One index.html per client; the four clients are the floor.
    expect(html.length).toBeGreaterThanOrEqual(4);
  });

  // HEX_RE was written for TypeScript. CSS has shapes TS does not, and the one that could plausibly
  // misfire is an id selector: `#app` is three characters after the `#`, so it could match the
  // 3-digit branch. It does not — `p` is not a hex digit — but "does not" is worth pinning rather
  // than assuming, since a false positive here would push someone toward the allowlist.
  it("HEX_RE handles CSS shapes: #fff shorthand matches, an id selector does not", () => {
    const hits = (src: string): string[] => [...(src.match(HEX_RE) ?? [])];
    expect(hits("color: #fff;")).toEqual(["#fff"]);
    expect(hits("color: #ffffff;")).toEqual(["#ffffff"]);
    expect(hits("#app { margin: 0 }")).toEqual([]);
    expect(hits("#root, #app-shell { }")).toEqual([]);
    // A 3-char id that happens to be all hex digits IS indistinguishable from a colour, and is
    // correctly flagged — renaming such a selector is cheaper than weakening the guard.
    expect(hits("#abc { }")).toEqual(["#abc"]);
    // Still no false positive on the GLSL directive the regex was hardened for.
    expect(hits("#define MAX_MATERIALS 256")).toEqual([]);
  });

  // The per-scope path mapping must apply to .html/.css exactly as it does to .ts — otherwise the
  // widened scan would check Hollow's stylesheet against EDG32 and report nonsense. Exercised on
  // synthetic paths rather than by writing a violation into the tree.
  it("per-scope palette selection applies to .html and .css paths, not just .ts", () => {
    const scoped = (rel: string): Scope => scopeOf(rel);
    expect(scoped("games/citadel/client/src/style.css")).toBe("citadel");
    expect(scoped("games/citadel/client/index.html")).toBe("citadel");
    expect(scoped("games/hollow/client/src/style.css")).toBe("hollow");
    expect(scoped("games/hollow/client/index.html")).toBe("hollow");
    expect(scoped("games/mathquest/client/src/style.css")).toBe("mathquest");
    expect(scoped("games/mathquest/client/index.html")).toBe("mathquest");
    expect(scoped("games/farm/client/index.html")).toBe("default");
    // palette.ts itself is the canonical source of EDG32 + Apollo +
    // Resurrect-64, so it gets its own scope rather than being flagged for
    // containing the other two palettes' swatches (sweep-02).
    expect(scoped("engine/core/src/render/palette.ts")).toBe("paletteSource");
  });

  // ALLOWLIST_FILES is empty, and that is a property worth keeping: a boot-screen background is
  // exactly the surface the palette rule exists for, so the fix for a violation is to map it to a
  // role, not to exempt the file. If this ever fails, the entry had better carry a written reason.
  it("the allowlist is still empty", () => {
    expect(Object.keys(ALLOWLIST_FILES)).toEqual([]);
  });

  it("atlas-builder SWATCH RGB tuples are all EDG32 colors", () => {
    const recipes = join(REPO_ROOT, "games", "farm", "atlas-recipes", "src", "palette.ts");
    const text = readFileSync(recipes, "utf8");
    const rowRe = /^\s*[A-Za-z.]:\s*\[\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\]/gm;
    const toHex = (r: number, g: number, b: number) =>
      "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    const bad: string[] = [];
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = rowRe.exec(text))) {
      const [, r, g, b, a] = m.map(Number);
      if (a === 0) continue; 
      count++;
      const hex = toHex(r!, g!, b!);
      if (!EDG32_SET.has(hex)) bad.push(`${hex} (rgb ${r},${g},${b}) → nearest ${nearestEdg32(hex)}`);
    }
    expect(count).toBeGreaterThan(10); 
    expect(bad, bad.length ? `Off-palette SWATCH colors:\n  ${bad.join("\n  ")}` : "").toEqual([]);
  });

  it("finds zero off-palette hex literals", () => {
    expect(
      violations,
      violations.length
        ? `\nOff-palette colors found — replace with the role constant for that file's ` +
            `palette (EDG.* from engine/core/src/render/palette.ts, CITADEL_PAL.* from ` +
            `games/citadel/client/src/render/citadel-palette.ts for games/citadel/, ` +
            `HOLLOW_PAL.* from games/hollow/client/src/render/hollow-palette.ts for games/hollow/, or ` +
            `MATE_PAL.* from games/mathquest/client/src/render/mate-palette.ts for games/mathquest/):` +
            `\n  ${violations.join("\n  ")}\n`
        : "",
    ).toEqual([]);
  });
});
