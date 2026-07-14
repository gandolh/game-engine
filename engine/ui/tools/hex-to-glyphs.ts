/**
 * hex-to-glyphs.ts — one-off generator: vendored UNSCII `.hex` bitmap fonts → committed
 * TypeScript glyph-table literals for `@engine/ui`.
 *
 * This is a BUILD-TIME TOOL, not shipped runtime code (nothing under `src/` imports it).
 * It reads a vendored `.hex` font (format: one glyph per line, `CODEPOINT:HEXBITMAP`,
 * row-major MSB-first, 8 bits per row — see `engine/ui/vendor/LICENSE.md`), keeps only
 * printable ASCII (0x20..0x7e), and emits a plain `Record<string, GlyphRows>` code
 * literal — the same spirit as the hand-authored font table it replaces: a committed
 * literal, not a font file read at runtime, so `bakeFontAtlas` stays a pure function of
 * source and produces a byte-identical raster on every machine.
 *
 * Run (from the repo root):
 *
 *   npx tsx engine/ui/tools/hex-to-glyphs.ts
 *
 * Regenerates BOTH outputs in one pass:
 *
 *   engine/ui/src/text/glyphs/unscii8.ts   <- engine/ui/vendor/unscii-8.hex   (8x8 cell)
 *   engine/ui/src/text/glyphs/unscii16.ts  <- engine/ui/vendor/unscii-16.hex  (8x16 cell)
 *
 * Deterministic: codepoints are emitted in ascending order regardless of source line
 * order, and the only inputs are the vendored `.hex` bytes — re-running against
 * unchanged vendor files reproduces byte-identical output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = join(HERE, ".."); // engine/ui

/** First / last code points kept (inclusive). Printable ASCII — matches the old font's coverage. */
const FIRST_CODEPOINT = 0x20;
const LAST_CODEPOINT = 0x7e;

interface ParsedFont {
  /** codepoint -> row bytes (one element per row, each 0..255, MSB = leftmost of 8 columns). */
  readonly rows: ReadonlyMap<number, readonly number[]>;
}

/** Parse a `.hex` bitmap font, keeping only printable-ASCII (0x20..0x7e) glyphs. */
function parseHexFont(path: string): ParsedFont {
  const text = readFileSync(path, "utf8");
  const rows = new Map<number, readonly number[]>();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const sep = line.indexOf(":");
    if (sep < 0) throw new Error(`${path}: malformed .hex line (no ':'): ${JSON.stringify(line)}`);

    const cp = Number.parseInt(line.slice(0, sep), 16);
    if (Number.isNaN(cp)) throw new Error(`${path}: bad codepoint field: ${JSON.stringify(line)}`);
    if (cp < FIRST_CODEPOINT || cp > LAST_CODEPOINT) continue; // only printable ASCII

    const bitmap = line.slice(sep + 1);
    if (bitmap.length === 0 || bitmap.length % 2 !== 0) {
      throw new Error(`${path}: codepoint 0x${cp.toString(16)} has a malformed bitmap: ${bitmap}`);
    }
    const byteCount = bitmap.length / 2;
    const rowBytes: number[] = [];
    for (let i = 0; i < byteCount; i += 1) {
      const byte = Number.parseInt(bitmap.slice(i * 2, i * 2 + 2), 16);
      if (Number.isNaN(byte)) throw new Error(`${path}: bad hex byte in codepoint 0x${cp.toString(16)}`);
      rowBytes.push(byte);
    }

    if (rows.has(cp)) throw new Error(`${path}: duplicate codepoint 0x${cp.toString(16)}`);
    rows.set(cp, rowBytes);
  }

  // Every printable-ASCII codepoint must be present, exactly once each.
  for (let cp = FIRST_CODEPOINT; cp <= LAST_CODEPOINT; cp += 1) {
    if (!rows.has(cp)) throw new Error(`${path}: missing codepoint 0x${cp.toString(16)}`);
  }

  return { rows };
}

/** `[0xNN, 0xNN, ...]` — one glyph's row bytes as a TS array literal. */
function rowsLiteral(rowBytes: readonly number[]): string {
  return `[${rowBytes.map((b) => `0x${b.toString(16).toUpperCase().padStart(2, "0")}`).join(", ")}]`;
}

function generate(opts: {
  hexFile: string; // vendored source, relative to engine/ui/
  outFile: string; // generated output, relative to engine/ui/
  glyphWidth: number;
  constPrefix: string; // e.g. "UNSCII8"
}): void {
  const hexPath = join(UI_ROOT, opts.hexFile);
  const outPath = join(UI_ROOT, opts.outFile);
  const font = parseHexFont(hexPath);

  // All glyphs in a vendored UNSCII .hex are the same cell size; sanity-check that instead
  // of silently trusting it (a mismatched row count would corrupt the packed atlas).
  const heights = new Set<number>();
  for (const rowBytes of font.rows.values()) heights.add(rowBytes.length);
  if (heights.size !== 1) {
    throw new Error(`${hexPath}: inconsistent glyph row counts across codepoints: ${[...heights].join(", ")}`);
  }
  const glyphHeight = [...heights][0]!;

  const lines: string[] = [];
  lines.push("/**");
  lines.push(` * GENERATED FILE - do not hand-edit.`);
  lines.push(` *`);
  lines.push(` * Produced by \`engine/ui/tools/hex-to-glyphs.ts\` from \`engine/ui/${opts.hexFile}\`.`);
  lines.push(` * Regenerate: npx tsx engine/ui/tools/hex-to-glyphs.ts`);
  lines.push(` *`);
  lines.push(` * ${opts.glyphWidth}x${glyphHeight} pixel-font glyph cells for printable ASCII (0x20..0x7e),`);
  lines.push(` * from UNSCII (public domain / CC-0 — see engine/ui/vendor/LICENSE.md). Glyphs are`);
  lines.push(` * white/alpha masks: this table carries no colour, only lit/unlit bits, so it stays`);
  lines.push(` * palette-agnostic (both games tint at draw time).`);
  lines.push(" */");
  lines.push('import type { GlyphRows } from "../glyph-types";');
  lines.push("");
  lines.push(`export const ${opts.constPrefix}_WIDTH = ${opts.glyphWidth};`);
  lines.push(`export const ${opts.constPrefix}_HEIGHT = ${glyphHeight};`);
  lines.push("");
  lines.push(`export const ${opts.constPrefix}_GLYPHS: Record<string, GlyphRows> = {`);
  for (let cp = FIRST_CODEPOINT; cp <= LAST_CODEPOINT; cp += 1) {
    const rowBytes = font.rows.get(cp)!;
    const key = JSON.stringify(String.fromCharCode(cp));
    lines.push(`  ${key}: ${rowsLiteral(rowBytes)},`);
  }
  lines.push("};");
  lines.push("");

  writeFileSync(outPath, lines.join("\n"), "utf8");
  // eslint-disable-next-line no-console -- one-off CLI tool, not shipped runtime code
  console.log(`wrote ${opts.outFile} (${font.rows.size} glyphs, ${opts.glyphWidth}x${glyphHeight})`);
}

generate({
  hexFile: "vendor/unscii-8.hex",
  outFile: "src/text/glyphs/unscii8.ts",
  glyphWidth: 8,
  constPrefix: "UNSCII8",
});

generate({
  hexFile: "vendor/unscii-16.hex",
  outFile: "src/text/glyphs/unscii16.ts",
  glyphWidth: 8,
  constPrefix: "UNSCII16",
});
