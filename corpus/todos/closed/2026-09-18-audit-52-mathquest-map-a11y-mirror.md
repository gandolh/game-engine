# audit-52 — MateQuest's map screen, the only screen with a strategic choice, has no a11y mirror

status: todo
created: 2026-09-18
context: found by the undone-work lens of the 2026-09-18 sweep. Flagged three times in MateQuest's own
BUILD-STATE (M3.1, M3.2, M3.3 "Known follow-ups") and never queued; M5 closed the milestone plan
without it.

## The gap

When M3.1 replaced the flexbox map with the spatial map, the screen became custom-drawn — and its DOM
accessibility mirror was dropped. [`main.ts:14-17`](../../../games/mathquest/client/src/main.ts#L14-L17)
records it:

> *"The widget dispatcher's root-provider (`currentWidgetRoot`) returns `null` in this mode so a stray
> widget hit-test can't fire, and the a11y mirror is cleared (**a full DOM mirror for the spatial map
> is a known follow-up**)"*

Confirmed at [`main.ts:298`](../../../games/mathquest/client/src/main.ts#L298) — `case "map": return null;`.
Every other MateQuest screen (combat, level-up, loot, run-won, run-lost) still mirrors.

## Why it matters more here than elsewhere

MateQuest is a **children's educational game** (Romanian curriculum, grades I–IV today) whose UI is
entirely in-canvas. The `@engine/ui` a11y DOM mirror *is* the screen reader — there is no fallback
markup behind it. Node choice is the roguelike's only strategic decision, and it is currently reachable
only by sighted pointer or by memorising the `1`..`9`/Enter bindings.

`@engine/ui`'s mirror exists precisely to prevent this, and the regression was introduced by a visual
polish pass — the shape worth noticing, not just the instance.

## What to do

Build a DOM mirror for the spatial map. The map is not a widget tree, so this is not a fold into
`computeLayout` — the mirror has to be produced from the map's own model
(`mapScreen.reachableOrder`, node kinds, the current position) and kept in sync as the run advances.

Decide what the mirror should *say*, not just that it exists: a node's kind, its grade/topic, whether
it is reachable, and where it sits relative to the hero are all things a sighted player reads off the
drawing. A mirror that lists nine unlabelled buttons passes an automated check and helps nobody.

Keep `currentWidgetRoot` returning `null` — the reason it does (stray widget hit-tests) is correct and
separate from the mirror.

## Files you OWN
- [`games/mathquest/client/src/main.ts`](../../../games/mathquest/client/src/main.ts) — the mode switch and mirror wiring
- [`games/mathquest/client/src/ui/map-screen.ts`](../../../games/mathquest/client/src/ui/map-screen.ts) — the model the mirror reads
- MateQuest client tests

## Files you must NOT touch
- `@engine/ui`'s `a11y/mirror.ts` — if the toolkit genuinely cannot express this, say so and stop;
  changing the shared mirror for one game's custom screen needs its own brief
- the map's rendering and input handling — this brief adds a parallel accessible representation, it
  does not restructure the screen
- Romanian as the default language — strings for the mirror need RO **and** EN, like every other
  MateQuest string

## Acceptance
- A test asserting the mirror exists in map mode, lists exactly the reachable nodes, and updates when
  the hero moves.
- Keyboard: the existing `1`..`9`/Enter/arrows still work, and mirror elements are focusable and
  activate the same choice.
- Both locales.
- Verify with an actual screen reader or the browser's accessibility tree, not only the unit test —
  the point of this brief is a real user, and a DOM node that exists is not the same as one that reads
  usefully.
