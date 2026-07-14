---
summary: The shared in-canvas UI toolkit (@engine/ui) — the UNSCII text stack, the palette-agnostic icon pipeline, the widget vocabulary, and the layout traps that bite when text metrics change.
updated: 2026-07-14
---

# @engine/ui — the in-canvas UI toolkit

`@engine/ui` (at [engine/ui/](../../engine/ui/)) is the retained-mode, **in-canvas** widget toolkit
shared by BOTH games. It is *not* listed in the repo-layout table in the root `CLAUDE.md` — it grew
out of the "all GUI in-game" push (no DOM chrome), and both clients now draw their HUDs through it.

Both games consume it, so **it may never import a game**, and it must work under **two different
palettes** (Citadel = Apollo-46, engine + Farm = EDG32). That single constraint explains most of the
design below.

## Text — the UNSCII font stack (2026-07-14)

The text stack renders a **bitmap pixel font baked to an atlas at boot** — no font file is loaded at
runtime, no platform font is measured, so the bake is byte-identical on every machine.

- **Source:** [UNSCII](https://github.com/viznut/unscii) by Viznut — **public domain**. The `.hex`
  sources are vendored at [engine/ui/vendor/](../../engine/ui/vendor/) and converted ONCE into
  committed TypeScript glyph tables by [tools/hex-to-glyphs.ts](../../engine/ui/tools/hex-to-glyphs.ts).
  - ⚠️ **Do not vendor `unscii-16-full.*`** — it is Unifont-derived and **GPL**. The base
    `unscii-8` / `unscii-16` files used here are outside that carve-out. See `vendor/LICENSE.md`.
- **Two sizes:** `BODY_FONT` (unscii-8, an **8×8** cell — the default) and `DISPLAY_FONT`
  (unscii-16, 8×16). `drawText`/`layoutText`/`measureText` take an optional `{ font }`.
- **Coverage is printable ASCII only (0x20–0x7e).** Anything outside it renders as the `?` fallback
  box — so **no emoji, no `✕`, no `·`** in an in-canvas label. Use ASCII (`X`, `-`).
- Glyphs are **white/alpha masks**, tinted by the caller. No colour ever enters the font path (the
  repo-wide palette guard forbids a hex literal here anyway).

This replaced a hand-coded **5×7** ASCII font that read as a debug font. The old font was **5px**
wide; UNSCII is **8px** — see the reflow trap below, which is the whole story of that migration.

## Icons — palette-agnostic shade-ramp masks

Icons live in [engine/ui/src/icon/](../../engine/ui/src/icon/): **34 glyphs at 16×16** covering
Citadel's build bar (22 buildings + 5 tools) and goods strip (7 goods).

- **An icon stores SHADE INDICES, never colours** (`.`/`1`/`2`/`3` = transparent/dark/mid/light).
  The **consumer supplies a 3-colour ramp** from its own palette at draw time. That is what lets ONE
  icon set render Apollo in Citadel and EDG32 in Farm without the engine knowing either palette.
- **Tinting mechanism:** the renderer's textured-quad path takes exactly ONE colour per quad (no
  per-pixel tint exists in either backend). So each icon bakes to **three pixel-disjoint 1-bit
  masks** (one per shade) and draws as three stacked tinted quads. Disjoint ⇒ draw order is
  irrelevant, and no renderer change was needed.
- The bake is pure + deterministic; a malformed recipe throws at **import**, not at draw.

### The authoring rule (do not skip — this is the expensive lesson)

**Never author or edit an icon without looking at it:**

```
npx tsx engine/ui/tools/icon-sheet.ts [nameFilter]
```

Citadel's building art was authored blind as ASCII pixel recipes, shipped unreadable, and had to be
**rebuilt from scratch as 3D meshes** (see [citadel-rendering.md](citadel-rendering.md)). The first
icon pass repeated it exactly: authored blind at 12×12, the "wheat" glyph rendered as mush and the
"hammer" as a slab on a stick. Rendering them and *looking* is the loop; 16×16 exists because 12×12
demonstrably could not carry a readable silhouette **and** two shade bands for `grain`/`flour`/`bread`.

## The reflow trap (read before changing ANY text metric)

Changing the font changes every layout that consumed it. The 5×7 → UNSCII migration surfaced four
bugs, and **not one was caught by a unit test** — every one needed a browser. They share a shape:
*something was positioned by a constant or a guess instead of by the laid-out rect.*

1. **Fixed pixel widths sized to the old font.** Farm's hotbar/inventory slots, tooltip wrap width,
   observer/slate/event-feed column widths all had constants tuned to a ~6px advance. All had to grow.
2. **A magic placement fraction.** Farm's DOM seed `<input>` was positioned at
   `panel.height * 0.52` — "just below the midpoint". The panel got taller, and the input collided
   with the Randomize button. Fixed by having the canvas row **reserve an empty slot** and
   positioning the input onto *that node's rect*.
3. **A container smaller than its own padding.** The slate's stock-bar track is 5px tall, but
   containers default to the **theme padding (6px)** — so the bar's fill was laid out at
   `track.y + 6`, i.e. entirely *below* its own track, printing on the caption beneath it. Any
   container shorter than the theme padding needs an explicit `padding: 0`.
4. **A node that reserved a text line where a sprite gets drawn.** Farm's hotbar drew a 26px item
   sprite over an empty `label("")` — one text line tall — so the art spilled onto the item's own
   caption. A node that a sprite is painted over must reserve the **sprite's** box.

**Labels do not wrap unless you ask them to.** `label(text, { maxWidth })` wraps; without it a label
is one unwrapped line that will run straight off a fixed-width panel. Any label carrying dynamic,
sim-authored text inside a pinned-width panel needs `maxWidth`.

## Accessibility

An icon-only button still passes its **text label** as the accessible name — the a11y mirror
([src/a11y/mirror.ts](../../engine/ui/src/a11y/mirror.ts)) always mirrors text, never icons. Do not
"optimise away" a button's label because the icon replaced it visually.

## Known gap

Citadel's `inspect-panel` wraps now, but **`villager-panel.ts` (`width: 200`) has not been audited**
for the wider font. Nothing is known-broken; it simply wasn't in scope.
