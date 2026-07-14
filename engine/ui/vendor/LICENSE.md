# Vendored fonts — UNSCII

`unscii-8.hex` and `unscii-16.hex` are from **UNSCII** by Viznut (Ville-Matias Heikkilä).

- Upstream: https://github.com/viznut/unscii (`fontfiles/`)
- Homepage: http://viznut.fi/unscii/

## License — Public Domain / CC-0

Upstream's statement:

> You can consider it Public Domain (or CC-0) except for the files derived from or
> containing parts of Roman Czyborra's Unifont project (`unifont.hex`, `hex2bdf.pl`,
> `unscii-16-full.*`) which fall under GPL.

**The two files vendored here are outside that GPL carve-out** — `unscii-8.hex` and
`unscii-16.hex` are the base variants, not the Unifont-derived `-full` ones. Do **not**
vendor `unscii-16-full.*`: it is GPL and would relicense this repo's font path.

## Why the `.hex` source is committed

These are the *source of truth* for the generated glyph tables in
[../src/text/glyphs/](../src/text/glyphs/). The tables are produced by
[../tools/hex-to-glyphs.ts](../tools/hex-to-glyphs.ts) and committed, so the runtime bake
stays deterministic and asset-free (no font file is loaded at runtime, matching the
project's "assets are code, not images" rule). Committing the `.hex` inputs means the
generated tables can be re-derived and audited rather than being unexplained magic numbers.

Format: one glyph per line, `CODEPOINT:HEXBITMAP`. Row-major, MSB-first, 8 bits per row —
16 hex chars = 8 rows (8×8), 32 hex chars = 16 rows (8×16).
