import { DEFAULT_FONT_METRICS, type FontMetrics } from "./font";

/**
 * Text measurement + word-wrap for the `@engine/ui` bitmap font.
 *
 * All measurements are in screen pixels at a given integer `scale` (default 1). Widths are
 * computed purely from the monospaced advance metric — no platform font involved — so they
 * are deterministic and match what {@link ./draw}.drawText paints exactly.
 */

export interface TextLayoutOptions {
  /** Integer pixel scale applied to glyph + advance + line height. Default 1. */
  scale?: number;
  /** Wrap width in screen pixels. Omit / Infinity for no wrapping. */
  maxWidth?: number;
  /** Font metrics to measure against. Default {@link DEFAULT_FONT_METRICS}. */
  metrics?: FontMetrics;
}

/** One laid-out line: its text and its pixel width (excluding the trailing tracking gap). */
export interface TextLine {
  text: string;
  width: number;
}

export interface TextLayout {
  lines: TextLine[];
  /** Width of the widest line, in screen pixels. */
  width: number;
  /** Total block height = lines * lineHeight * scale, in screen pixels. */
  height: number;
  /** Line advance in screen pixels (lineHeight * scale). */
  lineHeight: number;
  scale: number;
  metrics: FontMetrics;
}

/**
 * Width of a single line of `text` in screen pixels: `n` glyphs occupy
 * `n*glyphWidth + (n-1)*tracking`, scaled. Empty string → 0. Newlines are NOT handled
 * here (single line only); use {@link layoutText} for multi-line/wrapped text.
 */
export function measureText(text: string, opts: TextLayoutOptions = {}): number {
  const m = opts.metrics ?? DEFAULT_FONT_METRICS;
  const scale = opts.scale ?? 1;
  const n = text.length;
  if (n === 0) return 0;
  return (n * m.glyphWidth + (n - 1) * m.tracking) * scale;
}

/**
 * Lay `text` out into lines, honouring explicit `\n` breaks and greedy word-wrapping to
 * `maxWidth` (in screen pixels) when given. Wrapping breaks on spaces; a single word
 * longer than `maxWidth` is hard-broken per character so it never overflows.
 */
export function layoutText(text: string, opts: TextLayoutOptions = {}): TextLayout {
  const m = opts.metrics ?? DEFAULT_FONT_METRICS;
  const scale = opts.scale ?? 1;
  const maxWidth = opts.maxWidth ?? Infinity;
  const lineHeight = m.lineHeight * scale;

  const lines: TextLine[] = [];
  for (const raw of text.split("\n")) {
    wrapParagraph(raw, maxWidth, { metrics: m, scale }, lines);
  }
  if (lines.length === 0) lines.push({ text: "", width: 0 });

  let width = 0;
  for (const l of lines) if (l.width > width) width = l.width;

  return { lines, width, height: lines.length * lineHeight, lineHeight, scale, metrics: m };
}

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  opts: { metrics: FontMetrics; scale: number },
  out: TextLine[],
): void {
  if (maxWidth === Infinity) {
    out.push({ text: paragraph, width: measureText(paragraph, opts) });
    return;
  }

  // Greedy word wrap. Split on single spaces, preserving word boundaries.
  const words = paragraph.split(" ");
  let line = "";
  const flush = (): void => {
    out.push({ text: line, width: measureText(line, opts) });
    line = "";
  };

  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (measureText(candidate, opts) <= maxWidth || line === "") {
      // Fits, or the line is empty (must place at least the start of this word).
      if (measureText(candidate, opts) <= maxWidth) {
        line = candidate;
        continue;
      }
      // Empty line but the lone word itself overflows → hard-break per character.
      for (const ch of word) {
        const next = line + ch;
        if (line !== "" && measureText(next, opts) > maxWidth) {
          flush();
          line = ch;
        } else {
          line = next;
        }
      }
      continue;
    }
    // Doesn't fit on the current line: break before this word.
    flush();
    // Re-process the word on a fresh (empty) line — it may itself need hard-breaking.
    if (measureText(word, opts) <= maxWidth) {
      line = word;
    } else {
      for (const ch of word) {
        const next = line + ch;
        if (line !== "" && measureText(next, opts) > maxWidth) {
          flush();
          line = ch;
        } else {
          line = next;
        }
      }
    }
  }
  flush();
}
