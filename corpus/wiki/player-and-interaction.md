---
summary: The playable farmer Pip, the in-canvas @engine/ui GUI, hotbar, inventory, collapsible HUD panels, fishing, forageables, hover tooltips, and feature collision.
updated: 2026-07-15
---

# Player (Pip) & Interaction Systems

How the keyboard-controlled 5th farmer **Pip** works, plus the interaction/visual systems added alongside it (hotbar, hover tooltips, feature collision, bridges). This is the synthesis of the post-brief-35 work that previously lived only in session memory. As of 2026-06-04.

Verify before quoting — this page names specific files/functions; grep them if you're about to act on a claim (see [CLAUDE.md](../CLAUDE.md) → *Verifying before quoting the wiki*).

## In-canvas UI — all GUI on `@engine/ui` (2026-07-01)

As of 2026-07-01 **all** of Farm Valley's UI renders **in-canvas** through the game-agnostic
[`@engine/ui`](../../engine/ui/src) framework (the same one Citadel proved) — the old raw-DOM panels
are gone from the render path. The only remaining DOM is the home-screen **seed `<input>`** (native
text entry — canvas has no text-input widget) and the visually-hidden **a11y mirror** mounts
(`.ui-a11y` in `index.html`); the dev-only `DebugOverlay` and the `JuiceLayer` effects overlay are
still DOM but carry no panel UI.

- **Panels** live in [`games/farm/client/src/ui/canvas/*`](../../games/farm/client/src/ui/canvas):
  each is a retained widget tree built once by a `create<Panel>()` factory, then `refresh(state)`
  re-textures it in place and returns whether layout changed (gates the expensive
  `computeLayout` + a11y-mirror reconcile). Panels needing icons expose `drawIcons(surface)` (and the
  hotbar/inventory a drag `drawGhost`), drawn via raw `UISurface.sprite`/`.rect` quads AFTER
  `renderTree` (the widget model has no sprite node). The 5×7 bitmap font is ASCII-only, so glyphs
  the font can't render (season ✿☀, emoji) become atlas sprites or plain text.
- **Host + driver.** [`ui/canvas/ui-host.ts`](../../games/farm/client/src/ui/canvas/ui-host.ts) owns
  one `UISurface` + an ordered list of registered roots, each with its own `InputDispatcher` +
  optional a11y mirror, and the **capture-phase** canvas listeners that give the UI first dibs on
  pointer/wheel/key (gesture ownership decided at press — copies Citadel's routing). The render loop
  ([`main/render-loop.ts`](../../games/farm/client/src/main/render-loop.ts)) drives every panel per
  frame inside one `surface.begin()/end()`: `refresh → (if changed) computeLayout + mirror.update →
  renderTree → drawIcons/drawGhost`, each panel anchored independently (clock top-centre, hotbar
  bottom-centre, right-column top-right, playback bottom-right, leaderboard/inventory/help/game-over
  centred). [`main/panels.ts`](../../games/farm/client/src/main/panels.ts) builds + registers them all.
- **Screens** (home/loading/game-over/fatal) are canvas panels too; the home/loading screens run
  through the shared host in their own small RAF loop in
  [`main.ts`](../../games/farm/client/src/main.ts) *before* the sim exists. Boot-failure fatal keeps a
  DOM fallback (`main/fatal.ts`) since the renderer may itself be dead.

### Reinvented interactions (world-anchored + diegetic)

Beyond the mechanical port, three interactions were reinvented (all **client render/input only** —
no new sim state or protocol; determinism untouched):

- **World-anchored inspect card** ([`ui/canvas/inspect-panel.ts`](../../games/farm/client/src/ui/canvas/inspect-panel.ts)):
  while a farmer is followed (`focusedFarmerId`), a live detail card (name/personality/gold/FSM+AP/
  region/current intention, from the observer snapshot) floats **above that farmer and tracks their
  world position** each frame — via `worldToCanvasCss()` in
  [`main/screen-to-tile.ts`](../../games/farm/client/src/main/screen-to-tile.ts), the exact inverse of
  `screenToWorld` (Farm's analogue of Citadel's `tileToCanvasCss` badge anchoring).
- **Drag-from-world hotbar** ([`ui/canvas/hotbar.ts`](../../games/farm/client/src/ui/canvas/hotbar.ts)):
  the always-visible belt rearranges by drag, reusing the owner-gated **`swap-slots`** message (same
  as the inventory modal). Capture-phase window listeners with a movement threshold, so a plain click
  never counts as a drag and still falls through to the world tool-use action.
- **Diegetic HUD** ([`ui/canvas/diegetic-hud.ts`](../../games/farm/client/src/ui/canvas/diegetic-hud.ts)):
  a **notice-board** (latest events, high-drama gold) and **standings post** (day/time + current
  top-3) anchored over the world structures the sim already spawns — `structure/notice-board` at
  `NOTICE_BOARD_TILE` and the auction podium at `AUCTION_PODIUM_TILE` — so they read as in-world
  signage. Press **J** to **summon** both to screen-centre on demand, again to dismiss (todo
  decision #7's "hybrid diegetic + summon"). These tiles are stable because world geometry is seeded
  from the fixed `WORLD_GEN_SEED` (the run seed drives AI/economy, not layout), so client + server
  agree on them.

> Follow-ups: the superseded old DOM panels under `ui/*` (a self-contained dead subgraph; their tests
> still pass) can be pruned; minor layout polish remains (slate stock-bar text overrun; summoned-HUD
> overlaps the inspect card; **J** isn't yet in the help-modal key list). See the closed brief
> [farm-ui-all-rendered-in-canvas](../todos/closed/2026-07-01-farm-ui-all-rendered-in-canvas.md).

### Collapsible HUD panels (brief 117, 2026-07-15)

Five panels are **collapsed by default** behind always-visible labeled toggle buttons: the right
column's three sub-panels — **Farmers** (observer), **Shop** (slate), **Activity** (event feed) —
collapse independently, plus **Relations** (matrix) and **Wealth** (graph) bottom-left. Playback,
help, clock, hotbar, and the pre-existing toggles (Tab/E/J) are unchanged.

- **State** lives in [`ui/canvas/panel-prefs.ts`](../../games/farm/client/src/ui/canvas/panel-prefs.ts)
  (`createPanelPrefs(storage)`): write-through `localStorage` under `farm.ui.panels.v1`, default
  closed, in-memory fallback on any storage throw, and a parse **allowlist** (fixed 5-id union,
  boolean values only — stored JSON is external input; wholesale copying would admit a literal
  `__proto__` key). One shared instance is built in `main/panels.ts` and injected into the widgets.
- **Pattern**: each toggle button stays visible in BOTH states (it is the open *and* close
  affordance); the panel body appears below it while open. A toggle restructures the widget tree
  synchronously and forces the next `refresh()` to return `true` so the host relayouts. `wheel()`
  routing is gated on open state (a collapsed panel's last-laid-out rect is stale — never hit-test it).
- **Shortcuts**: **F** Farmers, **O** Shop, **T** Activity, **R** Relations, **G** Wealth — listed in
  the help modal (`KEY_BINDINGS`). Esc deliberately does NOT close these (reserved for modals).
- **Three traps** (all found by review/browser, all fixed in `931694a` — remember them when adding
  panels): (1) a default-closed panel's first `refresh()` returns `false`, so refresh-gated layout
  never runs and its button sits at the **zero rect, unclickable** — anchor blocks need a
  first-frame/resize size-key sentinel (see `matrixLaidOutSize` in `render-loop.ts`); (2) keys typed
  into the home-screen **seed input** accumulate in `Keyboard.justPressed` (nothing calls
  `endFrame()` before the game loop) and would fire hotkeys + write-through persist bogus state on
  frame 1 — the loop drains stale input once at its first frame; (3) the wealth graph clamps its
  bottom edge above the playback bar's rect — the open matrix pushes the bottom-left strip toward
  the canvas centre at narrow widths.

## Pip — a real farmer driven by input

Pip is a normal farmer **entity** in the sim worker with the same components as the four AI farmers, so crop-growth / harvest / market / render / animation all treat it identically. The only difference is the *source of its intentions*: keyboard input instead of an AI personality.

- Tagged by `personality.kind: "pip"` **and** a `player: { isPlayer, facing, pendingMove, pendingAction, selectedSlot }` component ([components.ts](../../games/farm/sim-core/src/components/)).
- [`PlayerControlSystem`](../../games/farm/sim-core/src/systems/player-control/) runs right before `ActSystem`: it moves Pip one tile/tick (walkability-checked, syncs `currentRegion` via `regionAt`) and, on an action key, builds the **same `Intention` shapes the AI emits** (`till`/`plant`/`water`/`chop-tree`/`mine-stone`) so `ActSystem` runs them unchanged. `DeliberateSystem` skips any entity with a `player` tag. **Player movement is NOT AP-gated** (free tile-by-tile walking for responsiveness); the action itself still flows through `ActSystem`'s AP/tool/proximity rules.
- `farmer.movedThisTick` flag exists so the render walk-cycle animates Pip even though it has no pathfinder `path`.

### Input plumbing

**Post-brief-72 (client/server split), the input path crosses a websocket + an owner gate** — it is no longer an in-worker `postMessage`:

`render-loop` reads the held axes from `keyboard` each frame → **`client.owner` gate** (only the run owner forwards Pip input; spectators in a shared run may not drive Pip) → resend **only when the held axis changes** (`moveChanged`, avoids per-frame flooding; held key persists server-side) → `SimClient.sendInput()` posts `{ type: "input", moveX, moveY, action, selectSlot }` over the **websocket** → server [`RunRegistry.handleControl`](../../games/farm/server/src/run-registry.ts) forwards it **only if `socket === run.owner`** → [`SimHost.applyInput`](../../games/farm/server/src/sim-host.ts) writes `pendingMoveX/Y` / `pendingAction` / `selectedSlot` onto the single `player` entity → [`PlayerControlSystem`](../../games/farm/sim-core/src/systems/player-control/system.ts) **reads** `pendingMove*` each tick (velocity move + per-axis AABB wall-slide). Note `pendingMove*` is **read but not cleared** (held-direction model); it persists until a keyup sends `null`.

Controls: **WASD/arrows** move, **Space** recenters camera on Pip, **left-click** = action on the clicked/faced tile (brief 79; E is no longer action), **E** = toggle inventory, **number keys 1–8** select a hotbar slot, **F/O/T/R/G** toggle the collapsible HUD panels (brief 117). Speed is set via the sidebar buttons.

> **Brief 78 (2026-06-11):** a reported "Pip doesn't move" was **not reproducible in a clean single-player `npm run dev`** — the full chain (client → registry `owner:true` → host `applyInput` → `PlayerControlSystem`) was verified healthy end-to-end via live instrumentation (Pip moved tile-by-tile, wall-collision intact). Root cause of the live symptom: **duplicate dev processes** (overlapping sessions left extra Vite/server instances running), so a second socket attached to the same run-key as a **spectator** (`owner:false`) and `render-loop` silently swallowed its input. Guarded headlessly by `run-registry.test.ts` ("input from owner IS forwarded" / "from spectator is NOT"). If it recurs in a clean session, the next suspect is keyboard focus, not the transport.

### Click-to-target + action-aware cursor (brief 79, 2026-06-11)

Pip can act on a **clicked** tile, not only the faced tile:

- **Targeting.** `Player` carries `pendingActionTile: {x,y} | null` ([farmer.ts](../../games/farm/sim-core/src/components/farmer.ts)). A canvas **left-click** converts pointer→tile via the shared [`screenToTile`](../../games/farm/client/src/main/screen-to-tile.ts) helper (dpr capped at 2, factored out of `tooltip.ts` so click/cursor/tooltip all agree) and sends it through `sendInput(..., actionTile)` → `applyInput` → the player entity. `PlayerControlSystem` uses the clicked tile when set (else the faced tile for the **E** key), with a **Chebyshev ≤ 1 reach guard** (a click >1 tile away is ignored); `pendingActionTile` is always cleared after consuming, and Pip's `facing` orients toward the click. `slotIntent` and `ActSystem` still own all validity (ownership/tool/AP/proximity) — a click only *proposes* a tile.
- **Cursor.** Slot-generic CSS named cursors (no sim round-trip): axe/pickaxe/fishing-rod → `crosshair`; hoe/watering-can/seed → `cell`; otherwise `default`. Set on `mousemove` from the selected hotbar slot. CSS cursors sidestep the EDG palette guard.
- **Pan moved to middle/right-drag.** Left mouse is now reserved for acting; camera pan is **middle (button 1) or right (button 2) drag** ([camera.ts](../../games/farm/client/src/main/camera.ts)); `contextmenu` is suppressed so right-drag doesn't pop the menu.
- **Determinism + spectators:** `pendingActionTile` defaults `null` and is only set by a click, so AI/headless is inert (3-seed/3-day `EXPORT=json` diff MATCH ×3). The click is `client.owner`-gated — spectators in a shared run cannot act.

### Pip's sprite
`pip` is a `PERSONALITY_SUBS` entry in [atlas-recipes](../../games/farm/atlas-recipes/src/) (gold hair `y→o`, green tunic `r→G`) which auto-generates the action + facing frames; a small extra block makes the 3 down-base frames. Rebuild with `npm run atlas`.

**Player facing is authoritative, not movement-delta.** For AI farmers, snapshot facing is derived from `t.x - t.prevX` (`resolveFacing`, 3-way side/up/down + flipX). That heuristic snaps Pip back to "down" the instant it stops between key presses, so for the player entity [`buildSprites`](../../games/farm/sim-core/src/snapshot-builder/) maps the authoritative 4-way `player.facing` directly: left/right → `"side"` + `flipX` (flip on left), up/down as-is. `resolveFrameAndBob` ([render-systems.ts](../../games/farm/sim-core/src/render-systems/)) then builds `base + dirSeg + walkSuffix`; the `farmer/pip/side`, `/up`, and directional walk frames all exist in the atlas.

## Hotbar — slot-based action dispatch

The action key uses the **selected hotbar slot**, not an auto-by-context guess. [`HOTBAR_SLOTS`](../../games/farm/sim-core/src/systems/player-control/) is the single source of truth, shared by sim dispatch, the `PlayerHotbar` snapshot field, and [ui/hotbar.ts](../../games/farm/client/src/ui/canvas/hotbar.ts):

| Slot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| | Can | Hoe | Axe | Pickaxe | Rod | Radish | Wheat | Pumpkin |

`player.selectedSlot` decides what Space/E/left-click does on the faced tile (hoe→till, axe→chop, pickaxe→mine, can→water, rod→fish open water from the isle, seed→plant that crop). Selection lives in the sim and flows out through the snapshot, so the UI panel is a pure reflection (highlights the active slot, dims out-of-stock seeds). **The rod was inserted at slot index 4 (2026-06-04), shifting the seeds to 5/6/7** — number keys now run 1–8 and the `player-control` test's `SLOT` map was updated to match.

> **The hotbar is now the top row of a mutable item grid (2026-06-11).** `HOTBAR_SLOTS` is no longer the layout source of truth — it's superseded by a per-player layout array. See *Inventory & the unified item grid* below; the table above is just the **default** layout (`defaultItemSlots()`).

## Inventory & the unified item grid (2026-06-11)

Pip's inventory is a **unified item grid** (Stardew-style): the bottom hotbar is just the first row; the rows below are the backpack, revealed by pressing **E** (Esc or E again closes; clicking the dimmed backdrop also closes). The grid is a player-owned **cosmetic layout over the aggregate inventory** — it decides *where* each item shows, never *how many* (counts always come from `Inventory`/`ResourceInventory`). So none of this touches the sim economy, and AI farmers (no `player` tag) carry no grid → **determinism is structurally unaffected**.

- **State.** `player.itemSlots: (ItemRef | null)[]` ([components/items.ts](../../games/farm/sim-core/src/components/items.ts), length `TOTAL_SLOTS` = `HOTBAR_SIZE` 8 + 3 backpack rows = 32). `ItemRef` is a discriminated union over tool / seed / crop / fish / resource / product / fruit / goldenBeans. Seeded from `defaultItemSlots()` (tools + radish/wheat/pumpkin seeds in the hotbar row, matching the old `HOTBAR_SLOTS` order).
- **Reconciliation.** [`PlayerControlSystem`](../../games/farm/sim-core/src/systems/player-control/system.ts) calls `syncItemSlots()` each tick: it **appends** any newly-held item kind to the first empty slot and **never removes** a slot (a sold-out item stays as a dimmed `x0` entry, so the player's manual arrangement is stable). Lazily seeds `itemSlots` if absent (older saves / inline-constructed test players).
- **Dispatch.** `refIntent()` (was `slotIntent`) reads the `ItemRef` at `selectedSlot`; only **tools and seeds** produce a field intention — held crops/fish/resources are inert.
- **Display.** `resolveItem(ref, inv, resources)` maps a ref → `{ label, glyph, frame, text, available, actionable }`. Atlas frames: tools `tool/*`, seeds `crop/*/seed`, crops `crop/*/mature`, shore fish `fish/{minnow,bass,salmon}` (coral specials + resources + golden beans have no sprite → glyph fallback), products `product/*`, fruit `fruit/*`. The snapshot carries the whole grid in `playerInventory: PlayerInventory` and the bottom-bar projection `playerHotbar` (first `hotbarSize` slots) — both built in [snapshot-builder/sprites.ts](../../games/farm/sim-core/src/snapshot-builder/sprites.ts).
- **Drag-drop = swap.** [ui/inventory.ts](../../games/farm/client/src/ui/canvas/inventory.ts) `InventoryPanel` uses HTML5 drag-and-drop; dropping slot A on slot B sends a new `{type:"swap-slots", a, b}` message ([protocol/messages.ts](../../games/farm/sim-core/src/protocol/messages.ts)) via `SimClient.swapSlots` → owner gate ([RunRegistry.handleControl](../../games/farm/server/src/run-registry.ts)) → [`SimHost.applySwapSlots`](../../games/farm/server/src/sim-host.ts) swaps the two `itemSlots` entries (bounds-checked). Moving an item between hotbar and backpack is just a cross-row swap. Layout is sim-authoritative, so the panel re-renders from the next snapshot (no optimistic local state). Swaps are **owner-gated** — spectators can open the panel to look, not rearrange.

**E is no longer "action".** Brief 79 moved Pip's action to **left-click**, freeing **E**; it now toggles the inventory. (The old "E = action" note in this page's input section is stale.)

## Fishing — the fishing isles, bubbles, and rare fish (2026-06-04)

Fishing is a **destination activity**: travel to a **fishing isle**, stand on its sandy shore, and cast into the surrounding ocean. The water you cast into determines rarity — calm shoreline yields cheap minnows, **bubble spots** yield the rarer, more valuable fish.

- **Two fishing isles**, each an 8×8 sand island in the southern open ocean: `fishing-isle` (`FISHING_ISLE_BOUNDS` = **75–82 × 105–112**, bridged to the mill) and `fishing-isle-2` (`FISHING_ISLE_2_BOUNDS` = **59–66 × 105–112**, bridged to forest-south) — see [regions.ts:77-78](../../games/farm/sim-core/src/world/regions.ts). *(These bounds moved with the 2026-06-09 radial reorg; pre-reorg they were 40–47/22–29 × 68–75.)* Both render with a `tile/sand` backdrop. A `FISHING_ISLE_IDS` list + `isFishingIsle()` helper let the renderer / fishing logic treat them uniformly.
- **Bubble spots** are transient churning-water patches that **drift daily** in the 1-tile ocean ring around **each** isle. [`BubbleSystem`](../../games/farm/sim-core/src/systems/social/bubbles.ts) (registered right after `TileFeatureSystem`, day-triggered off `DAY_START`, forks a seeded `"bubbles"` rng) clears yesterday's bubbles and re-rolls `BUBBLE_COUNT` (5) fresh ones per isle each new day (rings processed in `FISHING_ISLE_IDS` order for deterministic draws). A bubble is a `fishingSpot: FishingSpotTag` entity + `structure/fishing-spot` sprite (layer 4) on a non-walkable ocean tile — it never blocks movement. **Rising-bubble animation (2026-06-05):** the spot is **three bubbles that climb to the surface and pop**, animated over a 3-frame cycle `structure/fishing-spot` (A) → `-b` → `-c` (~1.2 s A→B→C, per-tile phase offset so neighbours don't bubble in lockstep). The swap happens **in `resolveFrameAndBob`** ([render-systems.ts](../../games/farm/sim-core/src/render-systems/)) on the single layer-4 snapshot sprite — not a separate overlay — so there's no double-draw; `FISHING_SPOT_FRAMES` is the exported cycle. Wall-clock driven (`nowMs`) like the foam/forge animations — purely cosmetic, no determinism impact (bubble tile positions still come from the seeded `BubbleSystem`). The bubbles use pale ocean-foam/white swatches (`q`/`e`/`w`), authored in [atlas-recipes](../../games/farm/atlas-recipes/src/). (This replaced the earlier static ring + separate `fishing-sparkle` overlay.)
- **The `fish` action** ([ActSystem.handleFish](../../games/farm/sim-core/src/systems/act/)) costs **1 AP** (`AP_COST.fish` in [ap.ts](../../games/farm/sim-core/src/systems/economy/ap.ts)). Requirements: a held rod, standing ON a fishing-isle tile (`isFishingIsle`), and an **ocean tile in the 4-neighbours** to cast into. If any adjacent water tile is a bubble, the cast uses `FISH_WEIGHTS_BUBBLE` `{minnow 25, bass 45, salmon 30}`; otherwise calm `FISH_WEIGHTS_CALM` `{minnow 80, bass 17, salmon 3}` ([components.ts](../../games/farm/sim-core/src/components/)). Fish are **minnow / bass / salmon worth 1 / 3 / 5 gold** (`FISH_VALUE`); the catch banks gold immediately + tallies `inventory.fish`. A random **5–30 s** busy window (`FISH_MIN_TICKS`=100 … `FISH_MAX_TICKS`=600) is set on `busyUntilTick`. **Deterministic**: `ActSystem` forks a `"fish"` rng channel; `fish` is excluded from `actionTicks` (the handler sets its own busy time).
- **Rod, no durability.** One kind, `durability: Infinity` so the shared tool find/prune plumbing never removes it. Every farmer starts with one (`STARTING_TOOLS`).
- **Player dispatch:** the rod slot emits `{ kind: "fish", … }` only when Pip stands on a fishing isle and faces an ocean tile (`PlayerControlSystem`); `ActSystem` re-checks isle + water + rod and reads bubbles for rarity.
- **AI farmers fish too — but the cast tiles are STALE (live bug, 2026-06-11).** [`deliberateFishing`](../../games/farm/sim-core/src/agents/watering/) sends the **opportunist** (every 5 days, 3 casts) and **aggressive** (every 7 days, 2 casts) to the nearest entry in `FISHING_CAST_TILES` ([shared.ts](../../games/farm/sim-core/src/agents/watering/shared.ts)), which still holds the **pre-reorg** tiles `(40,71)/(22,71)`. The isles are now at 75–82/59–66 × 105–112, so those tiles are **off-isle** → the farmer travels to open ground/ocean and the `fish` precondition (stand ON a fishing isle) never passes → **AI fishing no longer fires**. Pip's fishing is unaffected (it checks `isFishingIsle` dynamically). This is the same off-screen-coordinate class as brief 73's tavern/festival ocean-tile fix, which **missed `FISHING_CAST_TILES`**. Flagged in [open-questions.md](open-questions.md); a fix moves the sim baseline (re-verify like brief 73).

## Forageable berry-bushes — random-seed source (2026-06-11)

Berry-bushes are a third `tileFeature` kind (`"bush"`, alongside `tree`/`stone` — [world-features.ts](../../games/farm/sim-core/src/components/world-features.ts)) that reuse the entire trees/stones lifecycle: daily spawn in [TileFeatureSystem](../../games/farm/sim-core/src/systems/world-time/tile-features.ts), feature-collision blocking, plot-sense → `beliefs.data.tileFeatures`, and despawn-on-collect. **Collecting one yields one random seed** (no tool needed).

- **Spawn rates** (forked `tile-cluster` rng, shared per-region caps): farm tiles **+1% bush** (with 2% tree / 1.5% stone, cap 6); forests **+8% berry-bush understory** (with 25% tree, cap 20); quarries stay stone-only.
- **Seed reward is rarity-weighted** — [systems/act/seed-drops.ts](../../games/farm/sim-core/src/systems/act/seed-drops.ts) `SEED_WEIGHTS` (∑=100: radish 30, wheat 22, carrot 18, tomato 12, corn 8, winter-squash 6, pumpkin 3, grape 1) + `pickWeightedSeed(rng)`, mirroring `pickWeightedFish`. The seed lands in `inventory.seeds[crop]`.
- **Tree-chop bonus:** `handleChopTree` draws the same forked `"forage-seed"` rng each chop; `TREE_SEED_CHANCE = 0.2` → a chop gives the usual 2 wood **and** a 20% chance of one weighted seed. It always draws (even on a miss) so the stream stays deterministic.
- **Collect handler:** `handleGatherBush` ([handlers/resource.ts](../../games/farm/sim-core/src/systems/act/handlers/resource.ts)) — reach-checks, +1 weighted seed, +1 foraging XP, despawns; dispatched on the `gather-bush` intent (ActSystem). No AP/tool cost (treated like `forage`, not a physical tool action).
- **Player:** `PlayerControlSystem.bushAt(tx,ty)` — **clicking any bush forages it regardless of the selected hotbar slot** (foraged by hand). Pip blocks-and-stands-adjacent like chopping a tree (`featureAt` includes bushes). **AI:** [`deliberateResourceGather`](../../games/farm/sim-core/src/agents/watering/gather.ts) gathers bushes with no tool gate, so all four personalities forage them automatically.
- **Sprite:** new `structure/bush` recipe (green shrub + red berries — distinct from the flat decorative `decoration/bush` prop). Hover label "Berry Bush". Determinism is preserved (all new rng is forked); the per-chop draw **moves the sim baseline** (a new mechanic) — re-verify with a multi-seed `EXPORT=json` diff before trusting old baselines.

## Hover tooltips — name + description

[`updateTooltip`](../../games/farm/client/src/main/) renders the nearest labeled sprite's `label` (bold) + `description` (wrapped) within half-a-tile of the cursor. The snapshot builder sets both fields for farmers, all structures/NPCs, fountains, farmhouses, **trees, stones, crops** (crops include live growth/water state), and **decorative props** (2026-06-05). A sprite with `label === null` is not hover-able.

Props are sprite-only entities with no identifying component, so the snapshot builder ([snapshot-builder.ts](../../games/farm/sim-core/src/snapshot-builder/)) names them off their `sprite.frame` via the `DECORATION_LABELS` map (`decoration/barrel` → "Barrel", etc.). A new `decoration/*` prop just needs one entry in that map to become hover-able.

## Feature collision — trees/stones AND solid props block movement

`tileFeature` entities (trees/stones) are dynamic (spawn daily, despawn on chop/mine), so the static [`buildWalkableGrid()`](../../games/farm/sim-core/src/world/walkable-grid.ts) (regions + roads only) doesn't know about them. [`FeatureCollisionSystem`](../../games/farm/sim-core/src/systems/world-time/feature-collision.ts) holds the immutable base grid and each tick re-ORs blocked cells for the current feature tiles onto the **shared** `PathfinderGrid` that `TravelSystem` pathfinds over — so AI farmers route around features (and still stand *adjacent* to chop/mine, via `TravelSystem.resolveReachableTile`). It is registered right before `TravelSystem` in [sim-bootstrap.ts](../../games/farm/sim-core/src/sim-bootstrap.ts), after `TileFeatureSystem`/`HarvestSystem`. The player blocks moves onto feature tiles separately via `PlayerControlSystem.featureAt(tx,ty)`, since it walks by `isWalkable` rather than the grid. Determinism is preserved (depends only on live feature entities).

The same system also blocks **`solid`** entities ([components.ts](../../games/farm/sim-core/src/components/) `Solid`) — static tile-occupying obstacles used for the **workshop props and big-building footprints** (see *Big workshop buildings*). Solids are placed once at world setup (never moved), but blocking them in the same per-tick pass keeps one walkability authority. `PlayerControlSystem.featureAt` also checks `solid`, so Pip and the AI both walk *around* a forge oven / workbench / building instead of through it. Because blocking a tile can sever a chokepoint, [solid-connectivity.test.ts](../../games/farm/sim-core/src/world/solid-connectivity.test.ts) boots a sim, overlays every `solid` tile onto the base grid, and BFS-asserts every region center / plot / NPC station stays reachable and no solid covers a craft-island bridge mouth.


## World dressing, scenery & tile geometry

Split out on 2026-07-09 → [farm-world-dressing.md](farm-world-dressing.md) (workshop buildings,
island edges, coral zones, bridges, plot layout, the 240×240 radial archipelago layout).
