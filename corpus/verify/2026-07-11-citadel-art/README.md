# Verification — Citadel CC0 art ingest (2026-07-11)

Evidence for the **reject** call in
[../../todos/2026-07-11-citadel-external-cc0-art-ingest.md](../../todos/2026-07-11-citadel-external-cc0-art-ingest.md).

**Published page:** <https://claude.ai/code/artifact/4ba07f60-7c41-48b6-b446-0359a3d2c6e5>

Rebuild the page (it is gitignored — 566 KB of inlined base64, since the Artifact CSP blocks
every external request):

```bash
node corpus/verify/2026-07-11-citadel-art/build.mjs   # -> verify.html
```

## What's here

| File | What it shows |
|---|---|
| `assets/spike-1-nearest-colour.png` | CC0 buildings quantized to the nearest EDG32 swatch, flat and Bayer-dithered. Everything snaps to rust. |
| `assets/spike-2-material-ramp.png` | The same buildings restyled by material-classified luminance ramps. Better hues, unusable speckle. |
| `assets/current-buildings.png` | All 21 current `BUILDING_RECIPES` rasterized — showing that 8 of them are the same box. |
| `assets/gamut.json` | The source art's 60 heaviest colours + all 32 EDG32 swatches, with saturation/luminance. Drives the scatter plot. |
| `verify.template.html` | The page source. **Edit this**, not `verify.html`. |

## The finding in one line

EDG32 has exactly two low-saturation mid-tones (`#c0cbdc`, `#8b9bb4`) and **both are cool
blue-greys** — the palette has no warm neutral, which is the region photoreal renders are
almost entirely made of. A gamut mismatch, not a tuning bug.
