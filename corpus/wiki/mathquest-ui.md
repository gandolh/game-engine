---
summary: Whether MateQuest's screens should be immediate-mode (IMGUI) instead of @engine/ui's retained trees — what retained mode costs today, what an IMGUI must keep, the three places it could live, and the measured ?imgui combat prototype. Verdict: keep retained; the layer moved into @engine/ui as an option (2026-11-03).
updated: 2026-11-03
---

# MateQuest — retained or immediate-mode UI

Research for [the 2026-10-27 spec](../todos/closed/2026-10-27-mathquest-immediate-mode-research.md),
reading A (the owner's pick at the 2026-10-28 grill): could MateQuest's screens describe themselves
every frame (`if (button("Atac")) …`) instead of keeping an `@engine/ui` widget tree in sync with the
snapshot? Reading B (dropping the Worker) was not asked for and is not covered.

**Verdict: keep retained.** The sync costs about 100 lines on the combat screen and 20-25 on each
card screen, and no bug on record came from it. An immediate layer is cheap to add, and the
prototype proves it keeps the tree, the mirror and the keyboard identical. But it moves work into
every frame, delays clicks by a frame, and needs an engine module to pay off across games.

## 1. What retained mode costs today

| Screen | Build (code lines) | Per-frame re-bind | Notes |
|---|---|---|---|
| combat ([combat-screen.ts](../../games/mathquest/client/src/ui/combat-screen.ts)) | 106 | 101, plus 29 of helpers | ~57 nodes built once; 29 `setText`/`setState`/`setHpBar`/`sameChildren` calls; 4 slots whose children are swapped by phase |
| level-up | 31 | 21 | three offer cards |
| loot | 35 | 26 | three item cards + skip |
| run over | 26 | 25 | won/lost card |
| map ([map-screen.ts](../../games/mathquest/client/src/ui/map-screen.ts)) | — | — | already immediate: custom-drawn every frame, own hit-test (706 code lines) |

What the screens keep in sync: every label text and button label/state, each HP fill width, which
subtree sits in each slot, a `firstRefresh` flag, and a `changed` flag that gates the mirror
reconcile. The rule that hidden content is removed from the tree rather than faded (`hitTest` and
`focusables` ignore opacity) is a retained-mode hazard designed around, not a bug.

**Bugs on record** (the closed MateQuest specs, grepped): none came from the tree/snapshot sync. The
two UI defects that did ship belong to the **immediate** screen: the map had no a11y mirror until
[audit-52](../todos/closed/2026-09-18-audit-52-mathquest-map-a11y-mirror.md) added
[map-mirror.ts](../../games/mathquest/client/src/ui/map-mirror.ts) (108 code lines kept in step by
hand), and [playtest-07](../todos/closed/2026-09-20-playtest-07-locale-toggle-silently-discards-the-run.md)'s
fix first drew the locale toggle under the legend's background, a draw-order slip the unit tests
could not see.

## 2. What an IMGUI has to keep

- **Node identity across frames.** The dispatcher holds node *objects*: the focused node, the
  pressed node, and activation is "released on the same leaf it was pressed on" by `===`. A tree of
  fresh nodes each frame breaks Tab, hover, pressed state and any click that spans two frames. The
  a11y mirror diffs by node `id`, so fresh ids would rebuild its DOM every frame. So the IMGUI must
  key its calls (`"act.attack"`) and reuse the node for a key, or the dispatcher must track ids.
- **Keyboard focus and the canvas keypad**: kept for free once nodes are stable. Physical digits,
  Backspace and Enter go through `main.ts`, not the tree.
- **The a11y mirror**: unchanged, it reads the tree. The map shows the other path's cost: a screen
  with no tree needs a hand-written mirror.
- **Wrapped UNSCII text, pressed state, layout**: unchanged; `computeLayout` and `renderTree` already
  run every frame on the combat screen.
- **Animation** (`@engine/ui`'s `anim/`): MateQuest's widget screens use none, so nothing to keep.
- **Minimum supported viewport**: the same tree, so the same fit; the prototype passes
  `assertFitsViewport` at `MIN_VIEWPORT`.

## 3. Where it would live

| Shape | Effort | Risk |
|---|---|---|
| A keyed immediate layer in `@engine/ui` over the existing nodes, layout and `renderTree` | ~130 lines, no change to the dispatcher, mirror or renderer | lowest: Farm and Citadel untouched; it is opt-in per screen |
| A separate immediate toolkit in `@engine/ui` (own hit-test, focus, mirror) | large: re-implements what the tree gives | high: a second UI stack to keep honest, and a second mirror |
| MateQuest-only code in its client | same ~130 lines as the first | low, but only MateQuest can use it, and the next game copies it |

The prototype's layer imports only `@engine/ui`'s public API, so the first shape is the second's
code moved, not rewritten. It sits in the client for this research only.

## 4. The prototype (`?imgui`)

*Moved 2026-11-03:* the layer now lives in `@engine/ui`
([engine/ui/src/immediate/](../../engine/ui/src/immediate/immediate.ts), with key eviction), and
MateQuest's second combat screen and `?imgui` are gone. The files named below are in git history at
`381802ef`. `?profile` stayed.

`imgui/immediate.ts` (133 code lines) and `combat-screen-immediate.ts` implemented the same
`CombatScreen` interface; `main.ts` picked it under `?imgui`. `?profile` (new for MateQuest) times
the widget pass per frame.

- **Lines**: tree code 155 against the retained 236 (−34%); the draw passes are the same ~50 in both.
- **Same output**: a test diffs the two trees after the same refresh for all seven phases, and along
  one fight on single instances. In Chromium the a11y mirror's HTML (ids stripped) was identical in
  both phases checked, the screenshots were pixel-identical, and keyboard play matched (Tab lands on
  *Atacă*, Enter starts the problem, typed digits show, Backspace works).
- **Refresh cost** (Node microbenchmark, 20,000 frames, load average 62 to 66, so treat the
  absolutes loosely): retained 2.3 to 5.4 µs per frame, immediate 25 to 75 µs, 6 to 18 times more.
  Layout, which both run every frame, took 46 to 111 µs. In Chromium (SwiftShader, CPU-side, load
  20 to 89): refresh 0.06 to 0.08 ms average retained vs 0.2 to 0.35 ms immediate, with one run
  at load 89 averaging 1.5 ms. The microbenchmark's immediate cost is under 0.5% of a 16.7 ms frame. Raw numbers: [browser-profile.json](../verify/2026-10-28-mathquest-imgui/browser-profile.json).
- **Clicks arrive one frame late** (the IMGUI contract): `button()` returns true on the frame after
  the activation.

## Decision (owner, 2026-10-28)

`@engine/ui` stays retained, and the immediate layer moved into it as an opt-in feature: it was not
deleted as the research recommended. MateQuest keeps its retained screens. Recorded in
[decisions.md](decisions.md) → *UI — retained by default, immediate mode optional*; built by
[the move spec](../todos/closed/2026-10-28-mathquest-retire-imgui-prototype.md).
