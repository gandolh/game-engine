import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EDG32, EDG32_SET, EDG, isEdg32, nearestEdg32, normalizeHex } from "./palette";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);
const SOURCE_EXT = /\.(ts|js|mjs|cjs)$/;
const SKIP_FILE = /\.(test|spec)\.(ts|js)$/; 

const ALLOWLIST_FILES: Record<string, string> = {

};

const HEX_RE = /#[0-9a-fA-F]{6}(?![0-9a-fA-F])|#[0-9a-fA-F]{3}(?![0-9a-fA-F])/g;

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

describe("no source file uses an off-palette color literal", () => {
  const files: string[] = [];
  walk(join(REPO_ROOT, "engine"), files);
  walk(join(REPO_ROOT, "games"), files);
  walk(join(REPO_ROOT, "tools"), files);

  const violations: string[] = [];
  for (const file of files) {
    const rel = relative(REPO_ROOT, file).split(sep).join("/");
    if (ALLOWLIST_FILES[rel]) continue;
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const matches = line.match(HEX_RE);
      if (!matches) return;
      for (const m of matches) {
        if (!EDG32_SET.has(normalizeHex(m))) {
          violations.push(`${rel}:${i + 1}  ${m.toLowerCase()}  →  nearest EDG32 ${nearestEdg32(m)}`);
        }
      }
    });
  }

  it("scans a non-trivial number of source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("atlas-builder SWATCH RGB tuples are all EDG32 colors", () => {
    const recipes = join(REPO_ROOT, "tools", "atlas-builder", "src", "recipes", "palette.ts");
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
        ? `\nOff-palette colors found — replace with an EDG.* constant ` +
            `(see engine/core/src/render/palette.ts):\n  ${violations.join("\n  ")}\n`
        : "",
    ).toEqual([]);
  });
});
