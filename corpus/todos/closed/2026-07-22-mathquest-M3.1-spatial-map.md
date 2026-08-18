# MateQuest — M3.1: spatial "Mewgenics-style" progressive map (brief)

status: ready
milestone: M3.1 (polish on M3; see corpus/todos/2026-07-21-mathquest-BUILD-STATE.md)
design-of-record: corpus/wiki/mathquest-overview.md
builds on: M3 map & runs (branch `mathquest`, committed)

**Goal:** replace M3's flexbox grid-of-buttons map with a **spatial, hand-drawn-feeling map** in the
spirit of **Mewgenics / Slay the Spire**: nodes placed at absolute positions along a **winding path**,
connected by **dotted trails**, with the **party token sitting on the current node** and moving as you
advance. This is a CLIENT-ONLY change (`games/mathquest/client/`) — the run model, map DAG, and
`RunView`/`GameSnapshot` contract from M3 are unchanged. Full hand-drawn art (buildings, textured
skulls) is still M5; this delivers the spatial LAYOUT + progression feel now, with Resurrect-64 shapes
+ glyphs.

## What changes (and what doesn't)
- **Rewrite `ui/map-screen.ts`** from a retained `@engine/ui` widget tree into a **custom-drawn**
  screen using the low-level primitives (`UISurface.rect`, `drawText`, `measureText` from `@engine/ui`)
  — because `@engine/ui`'s widget layout is flexbox-only (no absolute positioning), which is exactly
  why M3 couldn't draw edges. Manual drawing lifts that limit.
- **`main.ts`** becomes mode-aware for the map: in `"map"` mode it renders the map via the new
  custom `render()` and routes clicks via a custom hit-test (NOT the widget `InputDispatcher`);
  `"combat"` and `"run_over"` keep their existing widget trees + dispatcher + a11y mirror unchanged.
- **Do NOT touch** sim-core, the combat screen, or the run-over screen (beyond wiring). Keep all M3
  tests green.

## Layout (deterministic from `RunView`, no rng needed)
Compute each node's pixel position purely from its `row`/`col` + the row's node count (stable given the
map). Suggested:
- **Vertical climb:** row 0 near the BOTTOM of the canvas, boss row at the TOP (you ascend). Rows evenly
  spaced over the available height.
- **Winding:** within a row, spread nodes horizontally across the width; add a gentle per-row
  horizontal phase offset (e.g. `sin(row)` based) so the column of nodes SNAKES left/right instead of
  stacking in straight columns — the Mewgenics/StS "winding trail" read. Keep it deterministic
  (function of row/col only), never `Math.random`.
- Everything must fit the canvas's logical size without scrolling for a ~7-row map (6 + boss). Pick node
  size / spacing accordingly (e.g. node box ~44×32, rows ~64px apart).

Expose the computed layout so `main.ts` can hit-test: e.g. the screen keeps an internal
`Map<nodeId, {cx, cy, w, h}>` rebuilt each `render()`, plus `nodeAt(x, y): number | null`.

## Drawing (in a single `render(surface, run, hoverId)` pass)
- **Dotted trails (draw FIRST, under the nodes):** for every node, for every `id` in `node.next`, draw
  a dotted line from this node's center to the target's center — sample N points along the segment and
  draw a small square (`surface.rect`, ~3×3) at each. Color: a dim `MATE_PAL.slate`/`steel` normally;
  brighten trails leaving the current node toward a reachable node (`MATE_PAL.gold`/`cream`) so the
  "where can I go next" reads at a glance.
- **Nodes:** a filled rounded-ish marker (a `rect`, optionally a 1px border via a slightly larger rect
  behind it) tinted by type (`combat`=skyBlue, `elite`=crimson, `rest`=green, `boss`=red — reuse the
  M3 chip colors), with a centered **glyph + grade** via `drawText` (⚔/★/☾/☠ + `G{grade}`; use
  `measureText` to center). State styling:
  - **reachable** (id ∈ `reachableIds`): full color + a bright highlight border (`MATE_PAL.gold`) +
    (optional) a subtle hover brighten when `hoverId` matches.
  - **visited** (id ∈ `visitedIds`): dimmed + a `✓` mark.
  - **other** (not reachable, not visited): dimmed/desaturated (draw at lower alpha) — the "locked/
    not-yet" read.
- **Party token:** draw a distinct marker (e.g. a `MATE_PAL.gold` diamond/filled square, or a "◆"
  glyph) ON the current node (`run.currentId`); when `currentId` is `null` (run start, before the first
  choice) place it just below row 0 as the "you start here" anchor.
- **Chrome:** keep the title (`STRINGS.mapTitle`), the warrior HP bar (persisted HP — reuse the M3
  bar draw), and the legend. These can stay simple `drawText`/`rect` too.

## Input (`main.ts`, map mode only)
- **Mouse:** on click in `"map"` mode, `const id = mapScreen.nodeAt(cssX, cssY)`; if `id !== null` and
  `id ∈ reachableIds`, post `choose-node{id}`. Track `hoverId` from mousemove for the hover brighten.
- **Keyboard (accessible fallback):** pressing `1`..`9` selects the Nth currently-reachable node (sorted
  by col then row) and posts `choose-node`; Enter picks the first reachable. This keeps the map usable
  without a mouse. (A full a11y DOM mirror for the spatial map is a known follow-up — note it in the
  module doc; the combat/run-over screens keep their existing mirror.)
- In `"combat"`/`"run_over"` modes, input is UNCHANGED (widget dispatcher + a11y mirror). Make sure the
  dispatcher's root-provider returns `null` in map mode so stray widget hit-tests don't fire.

## New map-screen interface (suggested)
```ts
export interface MapScreen {
  /** Draw the whole map for this frame. Call between surface.begin()/end(). */
  render(surface: UISurface, run: RunView, hoverId: number | null): void;
  /** Node id whose marker contains (x,y) in CSS-logical px, else null. */
  nodeAt(x: number, y: number): number | null;
  /** Reachable node ids in a stable order (for the 1..9 keyboard selection). */
  reachableOrder(run: RunView): number[];
}
export function createMapScreen(): MapScreen; // no actions needed — main.ts owns click→choose-node now
```
(You may shape it differently; the point is: custom render + hit-test, no widget tree for the map.)

## Strings
Reuse existing `STRINGS` (mapTitle, nodeLabel, legend*, warriorHpLabel, visitedPrefix). Any NEW
user-facing text goes in `strings.ts`. Romanian diacritics now render correctly (the font was just
extended) — RO strings are fine.

## Acceptance / verify (controller runs)
1. `npm run typecheck` green. 2. `npm run test -w @mathquest/sim-core` green (unchanged).
3. `npm run test -w @mathquest/client` green — update/replace `map-screen.test.ts` to the new
   interface: assert `nodeAt` returns the right id for a point inside a node and `null` outside; assert
   `reachableOrder` returns exactly the reachable ids. (Combat/run-over tests unchanged.)
4. `npm run test -w @engine/core -- src/render/palette.test.ts` green (no raw hex).
5. `npm run mathquest` (:5176) — **user playtests**: the map shows a winding dotted trail of nodes with
   the party token on the current one; reachable nodes glow, visited show ✓, others are dim; clicking a
   reachable node advances (token moves) and works to the boss; 1..9 keys also select.

## Hard rules
- No destructive git; do NOT commit (controller integrates). Edit ONLY under `games/mathquest/client/`.
  Do NOT edit sim-core, `engine/`, or `@engine/ui`. If you think you must, STOP and report.
- No raw hex — every color via `MATE_PAL.*`. (No sim code here, so no determinism concerns, but still
  no `Math.random` in anything that affects layout — layout must be a pure function of `RunView`.)
- Keep combat + run-over screens and their a11y/dispatcher wiring intact.

## Report back (final message = report to controller)
(1) files changed; (2) final pass/fail of each verify command; (3) the new `MapScreen` interface +
how `main.ts` routes map input by mode; (4) deviations + why; (5) precise browser steps to see the
winding map, the token moving as you advance, reachable-vs-visited-vs-locked styling, and both mouse +
1..9 keyboard selection.
