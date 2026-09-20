# playtest-04 — Farm's home screen still advertises "four BDI rivals", and clips its own controls hint

> **CLOSED 2026-09-20 — built.** The home screen now reads the rival count off
> `DEFAULT_FARMER_SPECS` (so it cannot drift from the roster again) and splits the pitch from the
> controls hint into two labels, neither of which clips. Verified in a browser: "20 BDI rivals" and
> the full "…Space to recenter on yourself." on its own line. 3 new tests, including an
> `includeContent` viewport-fit assertion — because here the bug was a clipped *label*, not a
> stranded button.
>
> The aside below about Farm being drivable in this sandbox is now folded into the wiki
> ([architecture.md](../../wiki/architecture.md) → *Driving the clients headlessly*).


status: CLOSED 2026-09-20 (see the note above; the original text below is unchanged) — a bug (stale copy + a non-wrapping label), found by playing the game in a browser
created: 2026-09-20
found: browser playtest at viewport **1280×577** (`npm run dev`, Chrome)

## What happens

The home screen's subtitle is one long label
([home-screen.ts:119](../../../games/farm/client/src/ui/canvas/home-screen.ts#L119)):

```
"Play as Pip and farm alongside four BDI rivals - plant, trade, and outwit them across 100 days.
 WASD/arrows to move, E to act, Space to recenter on yourself."
```

Two separate defects in that one string:

**1. "four BDI rivals" is wrong.** The field is **21 farmers — 20 AI + Pip** (5 named +
`EXTRA_FARM_COUNT = 16` procedural,
[sim-bootstrap.ts](../../../games/farm/sim-core/src/sim-bootstrap.ts)). Four is the number of
*personality archetypes*, not of rivals. This is the first sentence a player reads and it understates
the game by a factor of five.

This is the same drift the docs carried until 2026-09-19, when the README's four-row farmer table and
single-game framing were corrected (commit `47e07bd`, and the maintenance entry in
[log.md](../../log.md)). **The in-game copy was not part of that pass** — the sweep looked at `README.md`
and `docs/`, and never at strings compiled into the client. Worth noting as a lesson: player-facing
copy is a documentation surface too, and nothing routes to it.

**2. The line is clipped mid-word.** `@engine/ui` labels do not wrap — a `label()` is a single
measured run of text. At 1280px the subtitle is cut at `"… Space to rec"`, so the controls hint loses
"…enter on yourself." A new player is shown two of the three controls and a truncated word. The
string needs roughly 1400px to render in full, so it clips on any normal laptop window.

## What to do

1. **Rewrite the copy to match the game.** Something like: *"Play as Pip and farm alongside 20 BDI
   rivals across 100 days — plant, trade, and outwit them."* Do not hard-code `20` if it is cheap to
   derive: `DEFAULT_FARMER_SPECS.length - 1` is the honest source, and it will not drift the next time
   the roster changes. If deriving it is awkward at this layer, take the literal and add a comment
   pointing at `EXTRA_FARM_COUNT`.
2. **Split the subtitle into two or three labels** — a pitch line and a controls line — stacked in
   the existing column, each short enough to fit a narrow viewport. Splitting is the cheap fix; a
   wrapping `label` in `@engine/ui` is the general fix and a much larger change, so do not start
   there unless something else wants it.
3. While in there, consider whether the controls hint belongs on the home screen at all, given the
   in-game `?` panel exists. Keeping it is fine — just keep it on screen.

## Acceptance

- The home screen states the correct rival count, and a test asserts the subtitle contains the same
  number the bootstrap produces (so the copy cannot drift from the roster again).
- At **1024×600** and **1280×577** the full subtitle text is inside the canvas — asserted by laying
  out the home-screen tree and checking each label's `rect.x + rect.width <= viewportWidth`, not by
  eye.
- No other player-facing string claims four rivals: grep the client for `four`/`4 ` near
  farmer/rival wording before closing.

## Aside worth recording separately

While setting this up: **Farm's client does start in this sandbox**, contrary to the note in the
2026-09-19 sweep entry in [log.md](../../log.md) ("Farm's client cannot complete startup in this sandbox
— its Vite→`:8787` WebSocket proxy resets"). The WebSocket connected on the first try and the sim ran
to tick 1760 with 1082 entities, day/night wash, hotbar and playback controls all live.

The difference is **how the run is started**, not the proxy: a synthetic click on the canvas `Start`
button does nothing (the known in-canvas synthetic-pointer limitation), but the seed input is a real
DOM `<input>` with its own `keydown` handler
([home-screen.ts](../../../games/farm/client/src/ui/canvas/home-screen.ts)), so focusing it and
dispatching `Enter` starts the run. That is a reusable technique for driving Farm headlessly here and
should be folded into the wiki rather than left in this spec — see the log entry for 2026-09-20.
