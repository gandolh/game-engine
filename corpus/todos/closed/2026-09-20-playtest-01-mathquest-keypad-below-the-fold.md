# playtest-01 — MateQuest's typed-answer panel runs off the bottom of the viewport, taking Submit and all three lifelines with it

> **CLOSED 2026-09-20 — built.** The problem panel is now a two-column ROW (question left, input
> right) instead of one tall stack: the command box went **548px → 396px**, so at 1280×640 the
> keypad, `Trimite` and all three lifelines are on screen with headroom. Lifelines also got real
> keys (`H`/`F`/`S`), **printed on the button** so what a player reads is what they press. Verified
> in a browser at 1280×577 and pinned by 5 new `assertFitsViewport` tests — which were proved to
> have teeth by temporarily restoring the column layout and watching them name every off-screen
> button. Deviation from the plan below: the keypad was NOT shortened; it did not need to be once
> the stack became a row.


status: CLOSED 2026-09-20 (see the note above; the original text below is unchanged) — a bug, found by playing the game in a browser
created: 2026-09-20
found: browser playtest at viewport **1280×577** (`npm run mathquest`, Chrome, seed default)

## What happens

Choose **Atacă** on a `typed` problem (e.g. `5 − 2 = ?`). The problem banner, the answer display and
the `1..9` keypad rows render. **Everything below them does not:**

| widget | bottom edge (px, from `computeLayout`) |
|---|---|
| `←` / `0` / `Trimite` row | **622** |
| `Indiciu` / `50-50` / `Sări` (lifelines) | **712** |

At a 577px-tall viewport the third keypad row (`7 8 9`) is already clipped and **nothing below it is
on screen at all**. The player cannot press **Trimite**, cannot type `0`, cannot backspace, and
cannot use **any lifeline** with the mouse.

Measured with a throwaway probe over `createCombatScreen` + `computeLayout` at a sweep of heights:

```
h=577 {"0":622,"Trimite":622,"Indiciu (1)":712,"Sări (1)":712}
h=650 {"0":622,"Trimite":622,"Indiciu (1)":712,"Sări (1)":712}
h=720 {"0":622,"Trimite":622,"Indiciu (1)":712,"Sări (1)":712}
h=768 {"0":626,"Trimite":626,"Indiciu (1)":716,"Sări (1)":716}
h=900 {"0":758,"Trimite":758,"Indiciu (1)":848,"Sări (1)":848}
```

Note the shape of that table: **the positions do not move at all until the viewport exceeds ~768px.**
The subtree has an intrinsic height larger than the viewport, so it simply overflows below the canvas
instead of compressing. The minimum viewport height for the *whole* problem UI is **712px**.

**This is not an exotic window size.** A 1366×768 laptop — the likely school machine for a
grades-I–IV Romanian game — gives roughly 620–660px of viewport once browser chrome is subtracted.
The lifeline bar is off-screen there too.

## Why it is worse than it looks

1. **`choice` problems are fine.** Comparison problems (3 tiles + lifelines) fit inside 577px with
   room to spare — verified on screen. It is specifically the **4-row keypad** of the `typed` variant
   that pushes the panel past the bottom. So the bug hides from anyone whose first test problem is a
   comparison.
2. **Keyboard rescues the answer but not the lifelines.**
   [`main.ts`](../../../games/mathquest/client/src/main.ts) handles `0-9`, `Backspace` and `Enter` in
   combat — so a player who *knows* to type can still answer. There is **no keyboard shortcut for any
   lifeline**; they are reachable only by `Tab`-ing focus onto a button that is not on the screen.
   Lifelines are a headline design feature (the *Who-Wants-to-Be-a-Millionaire* items,
   [mathquest-overview.md](../../wiki/mathquest-overview.md) → Locked design), and they are the
   accessibility affordance for a struggling child — exactly the player least likely to discover an
   invisible Tab stop.
3. **Nothing signals the overflow.** No scroll, no fade, no "more below" cue. The screen looks
   finished; it is just missing its bottom half.

## Root cause

[`main.ts`](../../../games/mathquest/client/src/main.ts) lays the combat tree out **to the viewport**:

```ts
computeLayout(root, 0, 0, MATE_THEME, { width: canvas.clientWidth, height: canvas.clientHeight });
```

`computeLayout`'s `opts.height` sets the space the tree is *arranged into*; it does not clamp the
intrinsic height of the children. When the command box's content is taller than the box, the surplus
is drawn below the canvas and is unreachable by pointer — there is no clipping, no scrolling and no
scaling in the @engine/ui layout model.

**The same root cause produces [playtest-02](2026-09-20-playtest-02-citadel-hud-wider-than-the-screen.md)
in Citadel, on the horizontal axis.** Fix them independently, but see that spec's closing section for
the shared guard worth adding once.

## What to do

Settle the approach before coding — there is a real choice here:

1. **Compress the keypad** so the panel's intrinsic height fits a stated minimum viewport. The `1..9`
   grid plus `← 0 Trimite` is 4 rows of scale-3 tiles; a 3×4 grid (`1..9`, `←`, `0`, `Trimite` in the
   last row) is one row shorter, and the tile scale can drop on short viewports.
2. **Give the command box a height budget** and let the problem panel lay out within it — i.e. make
   the overflow a layout constraint rather than an accident.
3. **Both, plus a floor.** Pick a **minimum supported viewport** (state it in the spec — 1024×600 is
   the honest floor for a school laptop), guarantee the full problem UI inside it, and let the panel
   scale down rather than overflow below it.

Independently of which is chosen, **add keyboard shortcuts for the three lifelines** (e.g. `H`/`F`/`S`,
or `Shift+1..3`), announce them in the a11y mirror's instruction line the way the map screen already
announces "tastele 1-2", and put them in the `?`/help copy.

## Acceptance

- At **1024×600** and at **1280×577**, a `typed` problem shows the banner, the answer display, the
  full keypad, `Trimite` and all three lifelines **inside the canvas**, and each is clickable.
- A test asserts it rather than a screenshot: build the combat screen with a `typed` problem, run
  `computeLayout` at the minimum supported viewport, and assert every `button` node's
  `rect.y + rect.height <= viewportHeight` (and `rect.x + rect.width <= viewportWidth`). This is the
  guard that would have caught it — the existing
  [`combat-screen.test.ts`](../../../games/mathquest/client/src/ui/combat-screen.test.ts) asserts the
  retained *tree* and never asks where the tree lands.
- Each lifeline is reachable by a documented key, verified in a browser, not just in a unit test.
- The `choice` variant still fits (it does today — do not regress it while shortening the keypad).

## Out of scope

Redesigning the battle layout. The Pokémon-style framing (enemy top-left, hero mid-right, command box
along the bottom) is the design of record and reads well on screen — this is about the command box's
contents fitting the box.
