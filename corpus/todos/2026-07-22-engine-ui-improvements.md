# engine-ui — incremental improvements (not a rewrite)

Status: in progress (item 1 COMPLETE — all 6 consumers folded, 2026-07-23; item 3 done; item 2 deferred)

## Progress (2026-07-23) — Farmers width fix + last two folds + Relations/Wealth docking

- **Multi-line label/button width bug (engine-level, load-bearing) — FIXED.**
  [layout/layout.ts](../../engine/ui/src/layout/layout.ts) `textSize()` measured a multi-line
  label/button's WIDTH with `measureText` (which counts `\n` as a glyph and treats the whole string
  as one line), while measuring HEIGHT correctly via `layoutText`. So an N-line row (e.g. a 6-line
  observer farmer row) was measured ~N× too wide, dragging its panel — and the whole right column,
  via `align:"stretch"` — far wider than its content ("Farmers panel exceeds width" report). Now
  width uses `layoutText(text).width` (the widest resulting LINE). One line; affects every multi-line
  label/button in both games (all correct-direction: narrower). All UI suites green.
- **Farmers panel bounded + narrowed.** With the engine fix in place: the weather forecast now wraps
  one entry per line, the farmer row's State/AP field is split across two lines (so the longest single
  line — `DELIBERATE` + `100/100 (penalty)` — no longer lands together), and open-ended lines (crop
  list, focus reason) are truncated. `LIST_WIDTH` 390→340 in `observer-panel.ts` +
  `slate-billboard.ts` + `event-feed.ts` (all three share the stacked column, so they must narrow
  together); event lines are now word-wrapped to the box. Right column measured 485px→374px in-browser.
- **Item 1 — now COMPLETE: the last two consumers folded (the ones previously left as ceremony/blocked).**
  - `pip-farm-marker.ts` → `createPipFarmMarker()` returns a `custom` node; `setFrame(camera,canvas,zoom,nowMs)`
    binds the frame, the node draws in absolute screen-space (rect vestigial), host does
    `computeLayout`+`renderTree`. The bespoke `drawPipFarmMarker(...)` pass in the Farm render loop is gone.
    Verified in-browser (marker shows zoomed-out).
  - `minimap.ts` (`CitadelMinimap`) → `node()`/`setFrame()`: the raw-quad draw folds into a face-sized
    `custom` node (draws at its laid-out rect origin). Interactivity stays separate — the host still
    routes clicks to `trySeek(x,y,originX,originY)` with the SAME top-right origin (a `custom` node is
    non-interactive). Verified in-browser: minimap renders AND click-to-recenter still works.
  - (Earlier consumers: `wealth-graph.ts`, and overlay nodes in `slate-billboard.ts`/`hotbar.ts`/`inventory.ts`.)
  So **all 6 files named in the backlog below are now folded**; the "last real by-hand pixel math" is gone.
- **Relations + Wealth docked into the right column (user request).** They were floating bottom-left
  panels; now they're two more sections in the `Panels` sidebar ([right-column.ts](../../games/farm/client/src/ui/canvas/right-column.ts)
  `RightColumnExtras`), built in `panels.ts` and handed in. They keep their OWN `Relations`/`Wealth`
  collapse toggles (same tab styling; R/G hotkeys still drive them); their separate a11y roots +
  bottom-left render/anchor passes in the Farm render loop are removed (they render + a11y through the
  column root). Trade-off: opening the 21×21 matrix widens the (collapsible, default-closed) column —
  inherent to the grid. Verified in-browser (docked, flush tabs, chart renders, bottom-left clean).
- **Item 3 — DONE.** `villager-panel.ts` fixed width `200`→`288` (scale-2 `jobLbl` overran).
- **Item 2 — still deferred** (no panel demands grid yet).

## Intent

`@engine/ui` is already a shipped **retained-mode, flexbox-lite** toolkit
(`computeLayout` two-pass measure/arrange, dirty-tracked `refresh()`-gated layout,
hit-testing, input dispatch, a11y DOM mirror, tweens) live in ~39 panels across
both games. The retained-vs-immediate question is **settled (retained)** — see
[../wiki/engine-ui.md](../wiki/engine-ui.md) and brief 17. Retained is the right
call here specifically because of the a11y screen-reader mirror, which needs
stable node identity that immediate mode can't cheaply provide.

So this is **not** "build a layout system." It's a small, bounded backlog of the
toolkit's real gaps, ranked. Do each only when a real panel demands it — don't
build speculatively.

## The backlog (ranked)

1. **Custom-draw escape hatch inside `renderTree`.** *(highest value)*
   Charts, minimap, inventory grids currently bypass the widget tree and draw
   raw quads next to it — [minimap.ts:8-10](../../games/citadel/client/src/ui/minimap.ts)
   literally documents "no escape hatch for custom draws." Add a `canvas`/`custom`
   node kind that receives its computed rect + a draw callback, so those ~6 files
   (`wealth-graph.ts`, `minimap.ts`, `hotbar.ts`, `inventory.ts`,
   `slate-billboard.ts`, `pip-farm-marker.ts`) fold back into the layout system.
   This eliminates the last real by-hand pixel math.

2. **Grid / tabular layout.** Everything today is row/column/grow (flexbox-lite,
   no grid, no constraint solver). It has held up, but the relationship-matrix
   already strains it and any future table UI will too. Add a grid layout prop
   **when** a panel needs it, not before.

3. **Audit `villager-panel.ts` for the wider UNSCII font.** Known gap flagged in
   [../wiki/engine-ui.md](../wiki/engine-ui.md) (~lines 95-97): fixed `width: 200`
   was never re-checked against the wider bitmap font. Verify it doesn't clip.

## Context

- Toolkit source: [../../engine/ui/src/](../../engine/ui/src/) — `layout/layout.ts`,
  `layout/props.ts`, `widget/`, `input/`, `a11y/mirror.ts`.
- Origin decision: `briefs/engine/done/17-engine-ui-framework.md`.
- The "reflow trap" lessons (layout-by-constant vs layout-by-rect) are already
  documented in [../wiki/engine-ui.md](../wiki/engine-ui.md); recent churn is
  polish/consumption, not framework work.

## Acceptance

Each item is independently promotable to a brief. Item 1 is the one worth
scoping first if UI work is picked up.
