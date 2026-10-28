# MateQuest: retire the `?imgui` prototype (or promote it)

status: proposed — for the owner to approve or reject
created: 2026-10-28
context: follow-up to the immediate-mode research
([spec](closed/2026-10-27-mathquest-immediate-mode-research.md), findings on
[mathquest-ui.md](../wiki/mathquest-ui.md)). The research recommends keeping `@engine/ui` retained.

## Why

The prototype proved its point and the recommendation is not to build on it. Left in the tree it is
a second combat screen to keep in step with the first: every change to `combat-screen.ts` would
need the same change in `combat-screen-immediate.ts`, or its tree-diff test fails.

## What to do (the recommended option)

- Delete `games/mathquest/client/src/ui/combat-screen-immediate.ts`, its test, and
  `games/mathquest/client/src/ui/imgui/`.
- In `games/mathquest/client/src/main.ts`, drop `USE_IMGUI` and the `createImmediateCombatScreen`
  import. **Keep `?profile`**: MateQuest had no frame profile before the research, and the readout
  is cheap.
- Make the helpers `combat-screen.ts` exported for the prototype (`HP_BAR_WIDTH`, `HP_BAR_HEIGHT`,
  `CHOICE_SLOTS`, `TOPIC_ACCENT`, `hpColor`, `drawTileFrame`, `drawPlatform`, `drawCloud`)
  module-private again.
- Record the decision in `corpus/wiki/decisions.md` using the proposed entry on
  [mathquest-ui.md](../wiki/mathquest-ui.md).

## The other option, if the owner wants immediate mode

Promote instead of deleting: move `imgui/immediate.ts` to `engine/ui/src/immediate/` (it imports only
`@engine/ui`'s public API), export it from the barrel, add eviction for keys unseen for N frames, and
switch MateQuest's combat screen to it. That is a new engine surface and a decision entry saying
when a screen should use it; write it as its own spec.

## Acceptance (recommended option)

- No `imgui` in `games/mathquest/client/src/` and no `?imgui` handling in `main.ts`.
- `?profile` still exposes `window.__mqProfile()`.
- `npm run gates` passes.
