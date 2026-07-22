# engine-ui — incremental improvements (not a rewrite)

Status: in progress (captured 2026-07-22; item 1 foundation shipped + item 3 done, 2026-07-22)

## Progress (2026-07-22)

- **Item 1 — SHIPPED (foundation + overlay + 4 consumers).** Added a `custom` node kind to
  `@engine/ui` ([widget/node.ts](../../engine/ui/src/widget/node.ts) `custom()`/`CustomNode`): a
  layout-participating leaf whose `draw(surface, rect, alpha)` runs during `renderTree` in tree
  order + under inherited opacity. Non-interactive (hit-test pass-through via `isHittable`; inert
  in the a11y mirror alongside `icon`). **Also added `LayoutProps.overlay`** ([layout/props.ts](../../engine/ui/src/layout/props.ts),
  [layout/layout.ts](../../engine/ui/src/layout/layout.ts)): an out-of-flow child that fills its
  parent's inner box without consuming a slot/gap or shifting siblings — the missing piece that lets
  an on-top overlay fold into a panel's tree instead of a separate post-`renderTree` pass. Tests:
  [widget/custom.test.ts](../../engine/ui/src/widget/custom.test.ts).
  **Consumers folded in:** `wealth-graph.ts` (standalone `custom` node), and — via overlay custom
  nodes appended to their panels — `slate-billboard.ts` (crop icons + stock-bar fills), `hotbar.ts`
  (slot icons + selected border + drag ghost), `inventory.ts` (icons + border + ghost). The
  per-panel `drawIcons`/`drawGhost` methods + the host's separate draw passes are gone. All verified
  in a real browser.
  **Intentionally NOT folded:** `minimap.ts` is an *interactive* `CitadelMinimap` (click-to-recenter
  via `onSeek`) — a `custom` node is pass-through, so folding it needs its click wiring preserved
  separately; deferred. `pip-farm-marker.ts` is a world-space screen overlay drawn as its own pass;
  a `custom` node's rect would be vestigial (draw uses the camera), so a fold is pure ceremony — left
  as-is.
- **Item 3 — DONE.** `villager-panel.ts` fixed width `200`→`288`: the scale-2 `jobLbl`
  ("Job: Woodcutter" ≈ 268px) overran 200 at the wider UNSCII font and spilled past the panel bg
  (containers don't clip). All other rows are scale-1 and fit easily.
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
