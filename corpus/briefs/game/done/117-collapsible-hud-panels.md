# Task 117 — Collapsible HUD panels (collapsed by default, behind labeled toggle buttons)

> **DONE 2026-07-15 (`931694a`).** Built via plan-split-dispatch: 3 parallel Sonnet chunks
> (panel-prefs store / right-column / relations+wealth) + 1 wiring chunk, 2 Sonnet review
> finders, controller fixes. Keys chosen: **F/O/T/R/G** (R/F/G per the brief's suggestion; O/T
> for Shop/Activity). **Deviation:** `KEY_BINDINGS` rows were added in `playback-controls.ts`
> (on the brief's not-touch list) — data-only, controller-authorized, since the help modal the
> brief requires lives there. Review caught 3 real defects pre-browser: zero-rect unclickable
> Relations button (first-frame layout), home-screen seed typing firing hotkeys via stale
> `justPressed` (drained at first frame; also fixes pre-existing E/J/Tab leakage), and a
> `__proto__` parse hole in panel-prefs; the browser pass caught a 4th (wealth graph vs playback
> bar overlap at 1280×720 with the matrix open — clamped). Browser-verified per acceptance:
> default collapsed, each panel via button + hotkey, persistence round-trip, Tab unaffected,
> no overlap at 1280×720 / 1600×900. Gates: typecheck 14/14, suite green (client 230+).
> Synthesis: [player-and-interaction.md](../../../wiki/player-and-interaction.md) "Collapsible
> HUD panels" (the three traps are recorded there).

## Context

The Farm Valley screen is crowded: the relationships matrix (bottom-left), the right column
(observer panel + shop slate + event/activity feed), and the wealth graph are all always-on.
The user wants each of these hidden behind a small labeled button — pressing the button opens
or hides the panel — and **collapsed by default**. Time/playback controls, the help menu, the
world clock, the hotbar, and everything already toggleable (leaderboard on Tab, inventory on E,
diegetic HUD on J) stay exactly as they are.

Decisions locked with the user (2026-07-15):

- **Granularity:** the right column's three sub-panels (Observer, Shop Slate, Activity feed)
  collapse **independently** — three toggles, not one column toggle.
- **Scope:** relationships matrix + the three right-column sub-panels + the **wealth graph**.
  Nothing else changes.
- **UX:** a compact **labeled button strip** pinned where each panel lives (e.g. `Farmers`,
  `Shop`, `Activity` top-right; `Relations`, `Wealth` bottom-left). Clicking swaps
  button ↔ panel. Add keyboard shortcuts, and persist open/closed state in `localStorage`
  (default collapsed when no saved state).

This is pure render/UI work — zero sim impact. Side benefit: collapsed panels emit no glyph
quads, which directly reduces the per-frame UI-draw cost that brief
[118](../done/118-fps-regression-ui-glyph-tint-path.md) attacks (DONE 2026-07-15 — the tint
cache landed; this brief's glyph reduction is now a bonus, not the fix). **Interplay:** 118's
baseline profile was captured 2026-07-15 with all panels open, so this brief is unblocked.
must be captured before this lands (or with all panels forced open), otherwise this brief masks
the regression 118 measures.

## Files you OWN

- `games/farm/client/src/ui/canvas/right-column.ts` (+ test) — per-sub-panel collapse state,
  toggle buttons in the column stack, wheel routing respecting collapsed panels.
- `games/farm/client/src/ui/canvas/relationship-matrix.ts` (+ test) — collapse state + button.
- `games/farm/client/src/ui/canvas/wealth-graph.ts` (+ test) — gate the pure-draw `render()`
  behind an open flag; add a small button root so the collapsed state is clickable.
- `games/farm/client/src/main/panels.ts`, `games/farm/client/src/main/render-loop.ts` — wire
  the new toggles/roots, layout the button strips, keyboard shortcuts, localStorage load/save.
- A new small module for persistence is fine (e.g. `games/farm/client/src/ui/canvas/panel-prefs.ts`).

## Files you must NOT touch

- `games/farm/sim-core/**`, `games/farm/server/**` — no sim/protocol changes.
- `engine/ui/**`, `engine/core/**` — use the existing `button()` widget and the existing
  hidden-root pattern; if a toolkit gap genuinely blocks you, stop and surface it instead of
  patching the engine here (brief 118 owns the render backend).
- `ui/canvas/playback-controls.ts`, `world-clock.ts`, `hotbar.ts`, `leaderboard.ts`,
  `inventory.ts`, `diegetic-hud.ts`, `inspect-panel.ts`, `tooltip.ts` — out of scope.

## What to do

1. **Persistence helper.** Tiny `localStorage`-backed store (`farm.ui.panels.v1` or similar):
   `isOpen(panelId)` / `setOpen(panelId, v)`, defaulting **closed** for the five panel ids
   (`observer`, `slate`, `events`, `relations`, `wealth`). Guard against storage being
   unavailable (private mode) — fall back to in-memory.
2. **Right column.** Give each sub-panel an open flag. When closed, its slot in the column
   `box` renders a small labeled `button()` instead of the panel root (the strip reads
   top-to-bottom: `Farmers`, `Shop`, `Activity`, with open panels expanded in place). Toggling
   must force relayout (the render loop gates `computeLayout` on `refresh()`'s changed-result +
   `rcLaidOutW` — make a toggle count as changed) and update the a11y mirror. `wheel()` routing
   must not scroll a collapsed panel (rects must not go stale — `containsPoint` reads
   last-laid-out rects).
3. **Relationships matrix.** Same pattern bottom-left: closed → a `Relations` button; open →
   button (or header row) + the matrix. Its root stays registered; the hidden-root/inert
   dispatcher behavior comes free from `ui-host.ts` (`getRoot()` returning the collapsed tree
   is fine — it's still a valid root, just small).
4. **Wealth graph.** `wealthGraph.render(...)` is stateless pure-draw with no input handling —
   register a new small button root (`Wealth`) next to the `Relations` button and only call
   `render()` while open.
5. **Keyboard shortcuts.** Pick free keys (already taken: WASD/arrows, Space, E, Tab, J, Esc,
   Digit1–9, right-click). Suggestion: `R` relations, `F` farmers/observer, `G` wealth graph —
   confirm against `render-loop.ts`'s keyboard block and the help panel; **add the new
   shortcuts + buttons to the help modal text**.
6. **Defaults + persistence.** First load: all five collapsed. Reload restores saved state.
7. **Palette:** every color via `EDG.*` — the palette guard test will catch raw hex.

## Acceptance

- Fresh load (cleared storage): none of the five panels visible; five labeled buttons are, in
  the described positions. Clicking each opens/closes its panel; state survives reload.
- Wheel over a collapsed panel area zooms the world (no ghost scroll); wheel over an open
  observer/slate/feed still scrolls it. Tab/E/J/Esc behavior unchanged.
- Escape does NOT close the new panels (reserve Esc for modals, matching current behavior) —
  unless trivially clean to add after inventory/help/leaderboard in the existing chain.
- `npm run typecheck` and `npm run test` green; new/updated jsdom widget tests beside sources
  (follow `right-column.test.ts` / `relationship-matrix.test.ts` patterns), including: default
  collapsed, toggle flips, persistence round-trip, wheel-on-collapsed no-op.
- **Real-browser pass before closeout** (Playwright against `npm run dev`): screenshot default
  state + each panel opened; verify no layout overlap with hotbar/playback at 1280×720 and a
  large window.
- Closeout: fold into `wiki/player-and-interaction.md` (+ status/log per corpus workflow).
