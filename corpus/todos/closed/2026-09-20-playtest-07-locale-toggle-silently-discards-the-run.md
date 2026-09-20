# playtest-07 — MateQuest's language toggle discards the run in progress, and says nothing about it

> **CLOSED 2026-09-20 — option 1 built, as recommended.** With a run in progress the map's indicator
> now reads `RO | EN (repornește rulajul)` / `(restarts the run)` in orange, and stays plain on an
> untouched run. The rule is `localeSwitchCostsTheRun(run)` (`visitedIds.length > 0`), exported and
> unit-tested in both states and both locales. The reset itself is untouched and is now recorded in
> [decisions.md](../../wiki/decisions.md) → *MateQuest — the locale toggle re-inits the sim*, so the
> next reader finds the reason instead of a bug.
>
> **One regression caught by the screenshot, not the tests:** wiring the warning meant measuring the
> space it needs before the legend draws, and the first version did that by *drawing* the toggle
> first — which the legend's opaque strip background then painted over, so the toggle vanished
> entirely. The 14 unit tests passed before and after, because they assert the predicate and that
> `render()` does not throw, never what ends up on screen. Split into a pure
> `localeToggleLeftEdge()` measurement plus a draw that happens after the background.


status: CLOSED 2026-09-20 (see the note above; the original text below is unchanged)
created: 2026-09-20
found: visual playtest, 1280×577 — pressed `L` after clearing a node and taking loot

## What happens

Clear a node, win the fight, take the loot, return to the map. Press `L` (or click the "RO | EN"
indicator). The language changes — **and the run is gone.** The a11y mirror states it plainly:

```
Journey map. Level 1. Health 30 of 30. Places cleared: 0.  2 paths ahead.
```

In-run XP, level, gear, HP and every cleared node are discarded. Persistent mastery survives.

## The reset is DELIBERATE — do not "fix" it

[`i18n.ts`](../../../games/mathquest/sim-core/src/i18n.ts)'s module doc records it as the **locked
architecture** of the M5 slice-2 brief:

> *"the sim is locale-aware via an init option — like `seed`/`mastery` — and emits localized
> `prompt`/`teach`/enemy `name`/`title` text for the chosen locale. Toggling the locale RE-INITS the
> sim (a fresh run in the new language); mastery survives because it is persisted separately."*

And the reasoning holds. Generators draw operands **first**, then format for the locale, so text is
baked at generation time: a live run already holds an old-locale problem prompt and an old-locale
enemy name/title. Preserving the run across a switch would mean carrying locale-independent data and
formatting at the render boundary — a real architectural change, and the opposite of what the brief
settled. `locale` is an input like `seed`, which is also what keeps the determinism claim clean.

**So this spec is not about the reset.** It is about the fact that a visible, one-keystroke affordance
destroys progress with no warning, which is a UX defect whether or not the destruction is intended.

## Two audiences are uninformed, and that is the actual bug

1. **The player.** The indicator reads `RO | EN`. Nothing says "this restarts your run". The target
   player is 6–10 years old; the likeliest discoverer of this is a child pressing a button to see
   what it does, and the cost is their whole run. `L` makes it worse — an unlabelled hotkey that
   wipes progress, live in every mode including mid-fight.
2. **The next agent.** The decision lives in a source module doc and a closed brief.
   [decisions.md](../../wiki/decisions.md) does not have it, and
   [mathquest-overview.md](../../wiki/mathquest-overview.md) says only *"Bilingual RO / EN toggle from
   day one"*. Someone will find "the language button wipes your run", file it as a bug, and
   relitigate a locked call — exactly the "deliberate deviation" case `decisions.md` exists to stop.

## What to do

**Record the decision first** (that half is not optional): a `decisions.md` entry for the locale
re-init, with the reason, so the reset stops looking like a defect.

**Then make the consequence visible before the click.** Options, cheapest first:

1. **Label it.** When a run is in progress, the indicator reads `RO | EN (repornește)` /
   `(restarts)`. One conditional string, no new state, no modal — and a child who can read the
   button knows what it costs. **Recommended**, and the one to build now.
2. **Confirm on a second press.** A pending state plus a warning line, cancelled by any other input.
   More protective, but it needs somewhere to show the prompt in *every* mode (the map has the legend
   strip; combat does not), so it is a bigger change than it first looks.
3. **Only offer it when nothing is at stake** — live at a run's start and after a run ends, disabled
   during one. Safest, but it denies a legitimate want: a teacher switching language for a child
   mid-session.

Do **1** now. Leave 2 and 3 to a spec of their own if the label proves insufficient with real
players — that is a question for a classroom, not for this repo.

## Acceptance

- With a run in progress, the on-screen indicator states that switching restarts, in both locales.
- With no run in progress (nothing cleared, full HP, level 1), the indicator is unchanged — no
  scary label when there is nothing to lose.
- `decisions.md` carries the locale re-init decision with its reason.
- A test pins the conditional label to run state, not to a hard-coded string.

## Out of scope

Preserving a run across a locale switch. That is the locked decision above; reopening it needs a
spec that starts at the architecture (locale-independent sim data, formatting at the boundary), not a
bug fix.
