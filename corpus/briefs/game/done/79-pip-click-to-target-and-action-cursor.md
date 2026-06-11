# Brief 79 — Click a cell to act as Pip + action-aware cursor

**Status:** Todo · **Area:** `packages/farm-valley` (input / cursor) + `packages/sim-core` (Player component, PlayerControlSystem) · **Drafted:** 2026-06-11

Today Pip only acts on the **single faced tile** via the `E` key: `PlayerControlSystem` reads `player.facing`, computes the adjacent tile (`Math.round(transform) + DIR_DELTA[facing]`), and runs the selected hotbar slot's intention there. Add **click-to-target**: the player clicks a cell with the canvas and the currently-selected tool/seed acts on **that** tile. Additionally, the **mouse cursor changes to reflect the action** the selected slot would perform on the hovered tile (hoe→till, seed→plant, can→water, axe→chop, pickaxe→mine, rod→fish, or "no-op" when the slot can't act there). Depends on brief 78 (movement/input transport) being healthy — same client→server→`pendingMove*` chain.

## Read first

- [packages/sim-core/src/systems/player-control/system.ts](../../../../packages/sim-core/src/systems/player-control/system.ts) — `pendingAction` block (~L56–67) builds `tx/ty` from `facing` and calls `slotIntent(entity, slot, tx, ty)`. `slotIntent` (~L108) already takes an arbitrary `(tx, ty)` and returns the right intention (`till`/`plant`/`water`/`chop-tree`/`mine-stone`/`fish`) or `null` — **the targeting math is the only thing that needs to change to accept a clicked tile.**
- [packages/sim-core/src/components/farmer.ts](../../../../packages/sim-core/src/components/farmer.ts) — `Player` (~L38): `facing`, `pendingMoveX/Y`, `pendingAction: boolean`, `selectedSlot`. The action target is currently implicit (faced tile); a click needs to carry an explicit tile.
- [packages/farm-valley/src/main/render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) (~L355–398) — the per-frame input block (`client.sendInput`, owner-gated, brief 72) and the `updateTooltip(...)` call. Click handling and cursor updates hook in here / alongside.
- [packages/farm-valley/src/main/tooltip.ts](../../../../packages/farm-valley/src/main/tooltip.ts) (L36–41) — the **canonical screen→world conversion** (`mousePos` → `wx/wy` via dpr + `camera.worldUnits` + center). Factor this into a shared `screenToTile(camera, canvas)` helper and reuse it for both the cursor and the click target. `Math.round(wx/TILE)` → tile index.
- [packages/farm-valley/src/main/camera.ts](../../../../packages/farm-valley/src/main/camera.ts) — `mousePos` (tracked on `mousemove`) and the **`mousedown` camera-drag** handler (~L145). A click-to-act must be disambiguated from a pan-drag (see Risks).
- [packages/farm-valley/src/worker/sim-client/client.ts](../../../../packages/farm-valley/src/worker/sim-client/client.ts) — `sendInput()` (~L275) and the `{ type: "input", ... }` message; this is where a clicked-tile field gets added. Server side: [sim-host.ts](../../../../packages/server/src/sim-host.ts) `applyInput` (~L154) writes the input onto the player entity.
- [corpus/wiki/player-and-interaction.md](../../wiki/player-and-interaction.md) — Pip's hotbar + action model (slots, tools, `PlayerControlSystem` dispatch). Update after.

## Current state

- Action target = faced adjacent tile only; no pointer-driven targeting.
- The cursor is the default arrow over the canvas (camera.ts only sets cursor for drag/UI buttons elsewhere). No per-tile action feedback.
- The main thread has the **snapshot** (sprites + labels) but **not** plot ownership / `slotIntent` validity directly — that logic lives in the sim worker/host. This is the central constraint for the cursor feature (see task 4).

## Tasks

- [ ] **1. Carry a clicked tile through the input message** — add an optional target tile to the player input: extend `Player` with `pendingActionTile: { x: number; y: number } | null` (or make `pendingAction` carry an optional tile), thread it through `sendInput(... , actionTile?)`, the `{ type: "input" }` message, and `applyInput` in sim-host. Keyboard `E` keeps using the faced tile (pass `null`); a click passes the clicked tile.
- [ ] **2. Consume the clicked tile in PlayerControlSystem** — in the `pendingAction` block, if `pendingActionTile` is set use it as `(tx, ty)`; else fall back to the faced tile. `slotIntent` is unchanged. Add a **reachability guard** so a click can't act arbitrarily far away — recommend restricting to the 8 tiles adjacent to Pip (matching the faced-tile reach) or same-region + adjacency; decide and document. Clear `pendingActionTile` after consuming (like `pendingAction`).
- [ ] **3. Click handling on the canvas** — on a left mouse **click** (not a drag-pan), convert pointer→tile via the shared `screenToTile` helper and `client.sendInput(..., action:true, actionTile:{x,y})`, owner-gated (brief 72 — spectators must not act). Disambiguate from camera pan: treat it as a click only if the pointer moved less than a small threshold between mousedown and mouseup (and within a short time), so dragging still pans. Optionally also set facing toward the clicked tile for sprite readability.
- [ ] **4. Action-aware cursor** — change `canvas.style.cursor` based on what the selected slot would do on the **hovered** tile. The hard part is validity: `slotIntent` needs plot-ownership/feature/region data the main thread doesn't hold. Pick one (recommend a, escalate to b only if a feels too dumb):
  - **(a) Slot-generic cursor (cheap, no sim round-trip):** cursor reflects the *selected slot's tool* regardless of tile validity — e.g. distinct CSS cursors per tool (`crosshair` for axe/pickaxe, `cell`/`pointer` for hoe/seed/can, `crosshair` for rod). Simple, deterministic, no new data path.
  - **(b) Validity-aware cursor (richer):** have the worker/host expose a lightweight "what would the selected slot do at tile (x,y)?" prediction — either fold a small per-hovered-tile hint into the snapshot, or add a cheap query message — so the cursor can show an **active** vs **disabled/no-op** variant. More faithful but adds a data channel; only do this if (a) is judged insufficient.
  - Custom cursor art (if any) must use **EDG.* palette** constants and pass the palette guard; prefer CSS named cursors to sidestep that entirely.
- [ ] **5. Tests** — extend [player-control.test.ts](../../../../packages/sim-core/src/systems/player-control.test.ts): clicking a valid owned/empty plot with the seed slot queues a `plant` at the **clicked** tile (not the faced one); clicking out-of-reach is rejected by the guard; `E` with no clicked tile still uses the faced tile (regression). If 4(b) is chosen, test the prediction path headlessly.
- [ ] **6. Wiki + log** — document click-to-target + the cursor model in [player-and-interaction.md](../../wiki/player-and-interaction.md); add a `log.md` entry.
- [ ] **7. Verify** — `npm run dev`: hovering the canvas shows the action-appropriate cursor for the selected slot; left-clicking an in-reach tile performs the slot's action there (plant/till/water/chop/mine/fish), out-of-reach clicks do nothing, and click-drag still pans the camera. `E` faced-tile action unchanged. `npm run typecheck` clean, `npm run test` green.

## Acceptance

- With a hotbar slot selected, **clicking an in-reach cell** makes Pip perform that slot's action on the clicked tile; out-of-reach clicks are ignored.
- The cursor over the canvas reflects the selected tool's action (at minimum slot-generic per task 4a).
- Camera drag-to-pan still works (click vs drag disambiguated); the `E` faced-tile path is unchanged; only the run **owner** can click-act (spectators can't).
- `player-and-interaction.md` + `log.md` updated; typecheck + tests green.

## Risks / notes

- **Determinism:** the sim still owns validity — a click only *proposes* a tile; `slotIntent` + `ActSystem` enforce ownership/tool/AP/proximity exactly as for `E`. Keep changes to the **input transport + a tile field**; do not move `slotIntent` logic to the main thread (that would split the authority and risk the cursor "promising" actions the sim then rejects — acceptable for the cosmetic cursor, never for the actual effect).
- **Click vs pan:** `mousedown` currently starts a camera drag (camera.ts ~L145). Without a movement/time threshold, every click would also nudge the camera or every pan would fire a spurious action. Define the threshold carefully; consider left-click = act, and keep pan on the same button via the threshold (or move pan to middle/right-drag if cleaner).
- **Coordinate fidelity:** reuse the exact dpr-capped screen→world math from tooltip.ts (cap dpr at 2 to match `Canvas2dRenderer`) so the clicked tile matches what the player sees; a divergent copy will mis-target near zoom extremes.
- **Owner gating (brief 72):** route the click through the same `client.owner` gate as movement so spectators in a shared run can't drive Pip.
- **Palette:** any drawn cursor/target-highlight pixels must be `EDG.*`; CSS named cursors avoid the guard entirely and are preferred for 4a.
- **Optional polish (out of scope unless cheap):** a highlighted target-tile outline under the cursor (EDG-colored) would pair naturally with the cursor change — note it as a follow-up rather than expanding this brief.
