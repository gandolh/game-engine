# MateQuest: can it run on an immediate-mode UI? (research)

status: closed 2026-10-28 — researched; keep retained; prototype behind ?imgui; follow-up spec proposed
created: 2026-10-27
context: the owner, 2026-10-27: "research if we can make mathquest immediate mode". Research only.
Grilled 2026-10-28: the owner meant **A, immediate-mode screens**. Steps 1-3 are the work; step 4
(B) is not asked for.

## Two readings, and what the code already says

**A. Immediate-mode UI (IMGUI).** `@engine/ui` is a **retained-mode** in-canvas toolkit
([engine-ui.md](../../wiki/engine-ui.md)): each screen builds a widget tree, and layout, hit-testing,
pressed state and drawing (`renderTree`) all run over that tree. An immediate-mode UI has no
tree that outlives a frame: the screen's code runs every frame, calls `button("Atac")`, and gets
back whether it was clicked (Dear ImGui is the usual example). MateQuest's screens are
[`games/mathquest/client/src/ui/`](../../../games/mathquest/client/src/ui/) (combat, map, loot,
level-up, run over).

**B. A sim with no loop.** MateQuest is turn-based: state changes only inside commands, never in
`step()` ([`sim-bootstrap.ts`](../../../games/mathquest/sim-core/src/sim-bootstrap.ts)). The
worker's 20 Hz snapshot pump was deleted by
[audit-03](2026-09-13-audit-03-mathquest-drop-snapshot-pump.md); since then
[`sim-worker.ts`](../../../games/mathquest/client/src/worker/sim-worker.ts) posts a snapshot after
each command and nothing else. What B could still mean: dropping the Web Worker and calling the
sim on the main thread. That is a smaller question, and step 4 covers it.

The owner picked A on 2026-10-28, so steps 1-3 below are the work.

## What to find out

1. **What retained mode costs MateQuest today.** Lines of code per screen spent building, updating
   and tearing down trees; the state each screen keeps in sync between the snapshot and its widgets;
   any bug in `todos/closed/` that came from that sync (grep `mathquest` there). This is the case
   for the change, and it may turn out small.
2. **What an IMGUI would have to keep.** The things a retained tree gives for free and an IMGUI
   must rebuild with stable IDs:
   - keyboard focus and the canvas keypad;
   - the accessibility mirror ([`map-mirror.ts`](../../../games/mathquest/client/src/ui/map-mirror.ts),
     audit-52), which mirrors the tree into the DOM;
   - layout of wrapped UNSCII text, pressed state and animation (`@engine/ui`'s `anim/`);
   - the minimum supported viewport (glossary).
3. **Where it would live.** Three shapes, compared on effort and risk:
   - an immediate-mode layer in `@engine/ui` that builds a throwaway tree each frame and reuses
     layout and `renderTree` (the cheapest IMGUI, and Farm and Citadel are untouched);
   - a separate immediate-mode toolkit in `@engine/ui` beside the retained one;
   - MateQuest-only code in its client.
   The engine must stay generic and no game may import another (`layering.test.ts`).
4. **Reading B, briefly.** What the Worker still buys a turn-based game (keeping the main thread
   free during a problem's generation? nothing?), and whether the headless path the tests use
   already proves the sim runs on the main thread.
5. **Prototype one screen.** Rebuild the combat screen in the cheapest shape from step 3, behind a
   flag, and compare it with the retained one: lines of code, frame time with `?profile`, the
   mirror's output, keyboard play. Do not merge it into the default path.

## Deliverable

- A findings section on [mathquest-overview.md](../../wiki/mathquest-overview.md) (or a new
  `mathquest-ui.md` if it passes ~40 lines), with the step 5 numbers and a recommendation.
- If the recommendation is to build, a proposed entry for [decisions.md](../../wiki/decisions.md)
  (retained or immediate for `@engine/ui`, with the alternatives) and the follow-up specs, left
  for the owner to approve.
- `npm run gates` passes with the prototype behind its flag.

## Outcome (2026-10-28)

Steps 1-3 and 5 done; step 4 (reading B) skipped, as the grill said. Findings, numbers and the
recommendation are on a new page, [mathquest-ui.md](../../wiki/mathquest-ui.md) (it passed ~40 lines).

- **Recommendation: keep `@engine/ui` retained.** The retained sync costs ~100 code lines on the
  combat screen and 20-25 on each card screen, and no shipped bug came from it; both UI defects on
  record belong to the map, which is already immediate. The proposed decision entry is on the page,
  not in `decisions.md`, for the owner.
- **Prototype** (behind `?imgui`, default off): a keyed immediate layer over `@engine/ui`'s nodes
  (`ui/imgui/immediate.ts`, 133 code lines) and the combat screen rebuilt on it
  (`ui/combat-screen-immediate.ts`). It lives in the MateQuest client for the research; that is
  placement, not the recommended shape (which would be the same file in `@engine/ui`). Nodes must
  persist per key, because the dispatcher matches presses and focus by object identity.
- **Same output**: a tree-diff test over all seven phases; in Chromium an identical a11y mirror,
  pixel-identical screenshots ([capture](../../verify/2026-10-28-mathquest-imgui/immediate-combat-await-answer.png)),
  the same keyboard play. Tree code 155 vs 236 lines.
- **Cost**: refresh 6-18× the retained one (25-75 µs vs 2-5 µs per frame in a Node benchmark at
  load average 62-66); clicks arrive one frame late. `?profile` was added to MateQuest because it
  had none; it times refresh, layout, draw and mirror per frame
  ([browser numbers](../../verify/2026-10-28-mathquest-imgui/browser-profile.json)).
- **Follow-up spec, for the owner**:
  [retire the prototype](2026-10-28-mathquest-retire-imgui-prototype.md) (or promote it).
- **Gates** (`npm run gates`, load average 30 to 38): typecheck, build, smokes and pack-smoke
  passed; `@mathquest/client` 122/122. The one failure was the Hollow sim-core
  `mortality-emergence` timeout under load already on
  [open-questions.md](../../wiki/open-questions.md). Code: `381802e`.
