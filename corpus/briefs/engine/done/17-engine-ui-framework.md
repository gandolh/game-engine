# Brief 17 — `@engine/ui`: cross-game in-canvas UI framework (+ Citadel pilot consumer)

> **Done 2026-06-30** (branch `engine-ui-framework`, pending in-browser WebGPU visual check). Framework + Citadel resource-HUD pilot shipped; the other 5 panel todos + full DOM-overlay removal remain open (now unblocked).

> Immutable spec. Implements the round-7-grilled todo
> [../../../todos/2026-06-28-citadel-ui-all-rendered-in-game.md](../../../todos/2026-06-28-citadel-ui-all-rendered-in-game.md).
> Built via plan-split-dispatch (controller=opus). Scope of THIS brief: the **framework**
> (the blocker for all 6 Citadel UI panel todos) **+ one pilot consumer** that proves it
> end-to-end. The remaining 5 panels + full DOM-UI removal stay as their existing todos.

## Locked decisions (from the grilled todo — do not relitigate)
1. **In-game UI is a hard product requirement** — UI lives in the pixel-art world, drawn
   in-canvas, not as DOM overlays. (DOM-first would be throwaway design.)
2. **Hidden DOM a11y mirror is a required deliverable** — visuals 100% in-canvas; an
   invisible, screen-reader-only DOM tree (real `<button>`s + ARIA + focus) mirrors the UI
   and drives the **same** commands. Canvas = picture, DOM = interface for AT + keyboard.
3. **Full reusable toolkit** — panel/button/label, layout, scroll, text wrap, theming,
   animation, hit-testing. Justified: UI surface is large, ongoing, shared across Citadel +
   Farm + future games.
4. **New `@engine/ui` package** — game-agnostic (primitives only; no building types, no
   "bread") AND render-backend-agnostic (renders through `RendererLike` → works on **WebGPU
   AND Canvas2D fallback**, so Farm + headless tests can use it). Honors the locked rule:
   `@engine/core`/`@engine/ui` never import a game. Game panels live in each game's client.

## Grounding (from the 2026-06-29 mapping pass — verify before trusting)
- **Renderer abstraction:** `RendererLike` ([engine/core/src/render/renderer.ts:25](../../../engine/core/src/render/renderer.ts#L25)),
  `Canvas2dSprite` ([render/canvas2d/types.ts](../../../engine/core/src/render/canvas2d/types.ts)),
  layer-sorted sprites (`GHOST_UI_LAYER=80`). **No screen-space UI layer and no text
  rendering exist today.** WebGPU: instanced `SpriteBatch` + `GpuAtlasStore`; has `Overlay2D`
  for particles/weather. Canvas2D: `endFrame(...)` exposes an **unused `overlay` callback**
  with `{sx,sy,ox,oy}`. Camera2D is world-space only. Subpath-export pattern in
  [engine/core/package.json](../../../engine/core/package.json).
- **Citadel client:** DOM UI everywhere (`#build-bar`/`#hud`/follow-HUD/toasts/badges/
  minimap/settings/trader). Input via `placement-state.ts` → `transform.ts`
  (event→devicePx→world→tile). Render loop in
  [games/citadel/client/src/main.ts](../../../games/citadel/client/src/main.ts) (~886–1130):
  `beginFrame` → push scene/overlays → `endFrame` → DOM overlay reposition. Snapshot type in
  `games/citadel/client/src/.../snapshot/index.ts`; resource readout (bread/wood/pop/etc.)
  read in `onSnapshot`/`loop`.

## Acceptance (this brief)
- `@engine/ui` package exists, game-agnostic, renders on **both** backends through
  `RendererLike`; no game import. EDG32-clean (palette guard passes).
- Bitmap font renders deterministically (headlessly testable raster), text wraps/measures.
- Canvas-space input: hover/click/drag/focus hit-tests UI widgets and **intercepts before
  world clicks** in the Citadel input path.
- Hidden DOM a11y mirror present: invisible `<button>`/ARIA/focus tree, keyboard-operable,
  drives the same commands as the canvas widgets.
- **Pilot consumer:** the Citadel **resource HUD** (bread/wood/pop/happiness/day-season)
  renders in-canvas via `@engine/ui`, replacing its DOM `#hud` readout; mouse + keyboard +
  screen-reader all work. Proves cross-game-reusable framework end-to-end.
- Determinism untouched (render/input only — no sim, no `Math.random`/`Date.now`).
- `npm run typecheck` + `npm run test` green.

## Out of scope (follow-on todos)
- The other 5 Citadel panels (build-cost-hover, inspect, upgrade, town-hall button,
  villager-job) and full removal of every DOM overlay — their existing todos, built on this.
- Farm Valley adoption (the framework must *allow* it; actually porting Farm is later).
