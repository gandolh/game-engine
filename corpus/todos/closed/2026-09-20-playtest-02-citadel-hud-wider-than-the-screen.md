# playtest-02 — Citadel's resource HUD is 1500px wide, so Pause and the speed controls are off-screen on a 1280px display

> **CLOSED 2026-09-20 — built, with a simpler shape than this spec proposed.** The HUD is now two
> rows — `[readout, controls]` over `[goods]` — rather than the separate bottom-right controls root
> suggested below. Same outcome (every control on screen, panel clear of the minimap) with one root,
> one a11y mirror and no new plumbing, so the simpler version won. `Space` pauses and `1`/`2`/`4` set
> speed, through the same host-gated command path as the buttons. Verified in a browser at 1280×577
> (Space flipped the label to `Resume` from the authoritative snapshot; `4` resumed at 4x) and pinned
> by 6 new geometry tests, including the minimap non-overlap rule that `render-loop.ts` only stated
> in a comment.


status: CLOSED 2026-09-20 (see the note above; the original text below is unchanged) — a bug, found by playing the game in a browser
created: 2026-09-20
found: browser playtest at viewport **1280×577** (`npm run citadel`, solo/Cozy, Chrome)

## What happens

The top HUD bar's root panel is one `direction: "row"` containing `[readout, resources, controls]`
([resource-hud.ts](../../../games/citadel/client/src/ui/resource-hud.ts)). Laid out at its intrinsic
width it measures:

```
root:  x=8  w=1500  right=1508
Pause: x=1335  right=1391
1x:    x=1397  right=1426
2x:    x=1432  right=1461
4x:    x=1467  right=1496
```

On a 1280px-wide viewport that means:

- **`Pause`, `1x`, `2x` and `4x` are entirely off the screen.** They exist in the widget tree and in
  the a11y mirror (confirmed live: the mirror lists `Pause, 1x, 2x, 4x`), so the game *looks* like it
  has no sim controls at all. **Pausing and changing speed are core interactions of a settlement sim**
  and there is no pointer route to them.
- **The `Stone` and `Tools` chips spill past the panel's own background** and the last one is cut
  mid-word at the viewport edge — visible as grey text floating on the world with no panel behind it.
- **The HUD overruns the minimap.** The minimap is anchored top-right at `y=8`
  ([render-loop.ts](../../../games/citadel/client/src/main/render-loop.ts): `computeLayout(minimap.node(), mx, 8)`)
  — the same vertical band the HUD occupies. Other panels are explicitly placed to avoid it; the
  comment in that file even says *"so it never overlaps either or the top-right minimap"*. The
  resource HUD is the one panel that breaks that rule, because its width is unbounded.

No keyboard fallback exists: [`input.ts`](../../../games/citadel/client/src/main/input.ts) has no
pause/speed binding, only `Tab` focus traversal plus `Enter`/`Space` to activate whatever is focused.
So the controls are reachable only by tabbing onto buttons the player cannot see.

## Root cause

```ts
computeLayout(hud.root, 8, 8);   // render-loop.ts — no width/height opts
```

The HUD is laid out at **intrinsic size**, so its width is whatever its content needs (1500px with 7
goods chips) regardless of the canvas. Everything past the right edge is drawn off-screen and cannot
be hit-tested by a pointer.

This is the horizontal twin of
[playtest-01](2026-09-20-playtest-01-mathquest-keypad-below-the-fold.md) in MateQuest: an in-canvas
root laid out without viewport bounds, overflowing, and stranding the controls that happen to sit at
the far end.

## What to do

1. **Put the sim controls where they cannot be pushed off.** They are the highest-value widgets in
   that row and they are last in it. Anchor `controls` to the **top-right** as its own root (like the
   minimap and the bottom-left build bar), laid out right-aligned from `canvas.clientWidth`, and keep
   the readout + goods on the left. That removes the dependency between "how many goods exist" and
   "can I pause".
2. **Give the goods strip a width budget.** With the controls moved out, the remaining row must still
   fit `canvas.clientWidth` minus the minimap. Options: wrap the goods onto a second line, shrink the
   chip gap/scale on narrow viewports, or drop the good *names* and keep icon+count (the icons are
   already distinct and the a11y mirror carries the names).
3. **Add a pause/speed keybinding** (`Space` for pause, `1`/`2`/`4` for speed is the genre
   convention) so the controls are never input-gated on layout. Note `Space` currently activates the
   focused widget — pick bindings that do not collide, and document them in the settings modal.

## Acceptance

- At **1280×577** the HUD's readout and every goods chip render **inside a panel background**, and
  `Pause`/`1x`/`2x`/`4x` are visible and clickable.
- The HUD's laid-out rect does not intersect the minimap's laid-out rect at that viewport.
- Pause and speed work from the keyboard, verified in a browser.
- A test asserts the geometry: lay the HUD out at the minimum supported viewport and assert every
  `button` node satisfies `rect.x + rect.width <= viewportWidth`. The existing
  [`resource-hud.test.ts`](../../../games/citadel/client/src/ui/resource-hud.test.ts) checks the retained
  tree and derived button states, and never asks where they land — which is why this survived.

## The guard worth adding once (shared with playtest-01)

Both bugs are the same mistake in two games, and both are invisible to the current tests because
**no test in the repo asserts that a laid-out in-canvas root fits the screen it is drawn on.** Worth
one shared helper in `@engine/ui` (test-only is fine):

```
assertFitsViewport(root, { width, height })  // every focusable/interactive node inside the box
```

…called from each game's HUD/screen tests at that game's stated minimum supported viewport. That
minimum does not exist as a written number anywhere yet; pick one and record it in
[decisions.md](../../wiki/decisions.md) — it is the kind of constraint that is invisible in the code and
gets rediscovered by playing, which is exactly what `decisions.md` is for.
