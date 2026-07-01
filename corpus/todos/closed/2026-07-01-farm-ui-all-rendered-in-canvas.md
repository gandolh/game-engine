---
title: "Farm Valley — render ALL UI in-canvas via @engine/ui + reinvent interaction"
created: 2026-07-01
status: done
done: 2026-07-01
tags: [farm, client, engine, ui, render, architecture, interaction]
---

# Farm Valley: all GUI in-canvas (adopt @engine/ui) + reinvent interaction

> **DONE 2026-07-01.** All ~16 surfaces + the home/loading/game-over screens render in-canvas via
> `@engine/ui`; only the seed `<input>` + visually-hidden a11y mirrors remain in the DOM. Both
> reinvention halves shipped: **world-anchored inspect card** (tracks a followed farmer),
> **drag-from-world hotbar** (reuses `swap-slots`), and the **diegetic HUD** (in-world notice-board
> = events + standings post = day/top-3, anchored to `NOTICE_BOARD_TILE`/`AUCTION_PODIUM_TILE`,
> summonable with **J**). Commits `6ee527a` (port), `112304d` (inspect + drag), `9dcedb6`
> (diegetic). Gates: `@farm/client` typecheck clean; 295 client + 133 `@engine/ui` tests green;
> palette guard green; same-seed `EXPORT=json` byte-identical (render/input-only, determinism
> untouched); real-browser Playwright smoke passes (port + all three reinventions). Follow-ups:
> the old DOM panel files under `ui/*` (superseded, self-contained dead subgraph — kept, tests still
> green) can be pruned later; minor layout polish (slate stock-bar overrun, summoned-HUD vs inspect
> overlap, add **J** to the help modal key list).

Move **all** of Farm Valley's UI off the DOM and into the canvas by adopting the
game-agnostic [`@engine/ui`](../../engine/ui/src) framework Citadel already proved, AND
reinvent the interaction model (player *and* observer surfaces). This is the intended
cross-game payoff of the Citadel `@engine/ui` investment — "Farm Valley *can* adopt it
(proof of cross-game reuse)" is literally an acceptance criterion of
[all-GUI-in-game (done)](closed/2026-06-28-citadel-ui-all-rendered-in-game.md).

## Why this is tractable (grounding facts, verified 2026-07-01)
- Farm's client already renders through the same `RendererLike` as Citadel — **WebGPU
  primary, Canvas2D fallback** ([main.ts:59](../../games/farm/client/src/main.ts)) — and
  that interface **already exposes `beginUI/pushUI/endUI`**
  ([renderer.ts](../../engine/core/src/render/renderer.ts)); Farm just never calls them
  (all UI is raw DOM today). So this is **adopt + port + reinvent**, NOT build-from-scratch.
- `@engine/ui` is game-agnostic + backend-agnostic: retained-mode widget tree
  (`panel/box/label/button/slider/checkbox`), two-pass flex layout, deterministic 5×7
  bitmap font, canvas-space input dispatcher (hover/click/drag/focus + hit-test), EDG32
  theme tokens, and a **hidden-DOM a11y mirror**. Citadel drives ALL its UI through it.
- Farm currently has **~16 raw-DOM surfaces**, zero CSS files, all inline-styled via
  `applyStyles()` ([ui/dom.ts](../../games/farm/client/src/ui/dom.ts)); the only non-DOM UI
  is the wealth-graph's own Canvas2D context.

## Locked decisions (grilled 2026-07-01)
1. **Goal = BOTH** unify tech (kill the DOM/canvas split, one render path, EDG32-consistent,
   pixel-crisp) **and** reinvent interaction. Not a pure mechanical port.
2. **Full one-pass port** of all ~16 DOM panels onto `@engine/ui` (not a slow vertical
   slice) — but sequenced foundation-first (see build order).
3. **Pragmatic hybrid on the hard bits:** everything the player *sees* is canvas; a tiny
   **hidden DOM layer** remains only for (a) the home-screen **seed text-input** (native
   text entry / IME / paste — no canvas text-input widget exists) and (b) the **a11y
   mirror**. No visible DOM overlays remain over the world.
4. **Bitmap 5×7 font everywhere**, embraced as the aesthetic (retro pixel look).
   ⚠️ **Icon dependency:** the 5×7 font is ASCII-only, no icon/emoji glyphs — Citadel's
   build-bar had to drop emoji → text labels for exactly this reason (see
   [authored-typography-and-icons todo](2026-06-30-engine-ui-authored-typography-and-icons.md)).
   Farm leans on iconography (hotbar tool/seed icons, season glyphs ✿☀❧❄, slate offer
   icons). **Mitigation:** Farm's atlas *already* has tool/crop/fish/product sprite frames
   — draw those via `UISurface.sprite` inside widgets (Citadel's occupancy-badges pattern);
   fall back to text only where no sprite exists. Do NOT block on the authored-font todo.
5. **Radial menu: DROPPED.** Keep Pip's fast slot(1–8)+left-click loop unchanged.
6. **Reinvent BOTH** player and observer surfaces (the game is mostly *watched* — most DOM
   is observer-facing: leaderboard, farmer list, relationship matrix, event feed, wealth
   graph, forecast).
7. **Observer data = hybrid diegetic + summon.** Data gets an in-world home (notice-board
   for events, signpost/clock-tower for time/standings) AND can be **summoned** as a
   screen-anchored panel on a key/click. World flavor when exploring; instant readout on demand.
8. **Client-render-only.** No NEW sim state or protocol. Reuse existing messages —
   crucially the **drag-from-world hotbar reuses the existing `swap-slots` message**
   (owner-gated, sim-authoritative layout) + existing Pip input messages. **Determinism
   untouched → no headless re-verify needed** (render/input only).
9. **Port the a11y mirror** (reuse Citadel's `a11yMirror` reconcile pattern) so canvas UI
   stays screen-reader navigable — parity with what DOM gave for free.

## New interactions (the reinvention half)
- **World-anchored panels** — inspect/tooltip/dialog panels float attached to a world
  entity (farmer, plot) and track it as the camera pans (Citadel `tileToCanvasCss` /
  occupancy-badge positioning pattern), vs fixed screen-corner boxes.
- **Diegetic HUD** — HUD elements living in the world fiction (notice-board = events,
  signpost/clock-tower = time/standings), per decision #7 also summonable.
- **Drag-from-world hotbar** — in-canvas drag to rearrange the belt/inventory (reusing
  `swap-slots`), hover-to-preview action ghosts on tiles. Replaces HTML5 drag-drop.

## DOM surface inventory to port (verified 2026-07-01)
Player-action: **hotbar** (`ui/hotbar.ts`), **inventory** modal + drag-drop
(`ui/inventory.ts`), **tooltip** (`main/tooltip.ts`).
Observer: **world-clock** (`ui/world-clock.ts`), **observer panel / farmer list**
(`ui/observer/panel.ts`), **leaderboard** (`ui/leaderboard.ts`), **playback controls +
help modal** (`ui/playback-controls.ts`), **slate billboard** (`ui/slate-billboard.ts`),
**event-feed panel** (`ui/event-feed-panel.ts`), **right-column** container
(`ui/right-column.ts`), **relationship matrix** (`ui/relationship-matrix.ts`), **wealth
graph** (own Canvas2D → `UISurface`, `ui/wealth-graph/panel.ts`).
Screens/modals: **home screen** (seed input stays hidden-DOM, `screens/home-screen.ts`),
**loading screen** (`screens/loading-screen.ts`), **game-over** (`main/game-over.ts`),
**fatal error** (`main/fatal.ts`). Input routing lives in
`main/render-loop.ts` + `main/camera.ts` + `main/screen-to-tile.ts`; panels assembled in
`main/panels.ts`.

## Build order (foundation → fan out → reinvent)
1. **Foundation.** Add `@engine/ui` dep to `@farm/client`; wire the font atlas + `UISurface`
   + `InputDispatcher`(s) + a11y mirror into `main/render-loop.ts`; prove ONE trivial panel
   end-to-end (**world-clock**). Establish the capture-phase input-priority pattern
   (UI dispatchers checked before world; gesture ownership decided at press — copy Citadel
   `main.ts` routing) so canvas clicks don't leak to world tile-actions.
2. **Fan out the port.** Port the remaining panels onto `@engine/ui`, using atlas sprites
   for icons (decision #4 mitigation). Wealth-graph → `UISurface` quads/lines.
3. **Reinvent.** Layer world-anchored panels, diegetic HUD (+ summon), drag-from-world
   hotbar on top of the ported surfaces.

## Acceptance / done bar
- **No visible DOM UI overlays** over the Farm world; all ~16 surfaces render in-canvas via
  `@engine/ui`, EDG32-clean (palette guard green). Hidden DOM only for the seed input +
  a11y mirror.
- New interactions live: world-anchored panels track their entity; diegetic HUD + summon;
  drag-from-world hotbar rearranges via `swap-slots`.
- Gates: `npm run typecheck` clean; `npm run test` green (`@engine/ui` + `@farm/client`);
  **determinism `CHECK_DETERMINISM` still MATCH** (proves no sim drift — render/input only);
  **plus a real-browser smoke pass** (Playwright driving Farm: panels render, bitmap text is
  legible, clicks route to UI not world, seed input still works) — honors the standing
  "verify UI in a browser before done" rule.
