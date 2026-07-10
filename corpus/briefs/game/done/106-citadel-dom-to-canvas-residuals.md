# Brief 106 — Citadel DOM→canvas residuals (siege/hazard readouts)

status: **DONE 2026-07-10.** Commit `242dbbe`.

> **Closeout 2026-07-10.** The five siege/hazard readouts (`hud-threat`, `hud-defense`,
> `hud-keep`, `hud-fire`, `hud-disease`) plus `lbl-mode` are migrated onto a retained
> `@engine/ui` widget (`games/citadel/client/src/ui/siege-hud.ts`), built once + refreshed
> per frame following the `resource-hud.ts` precedent: EDG-only colours (thresholds carried
> over from the old CSS), an aria-live a11y mirror (`#ui-a11y-siege`), pointer/wheel forwarded
> for click-consumption. `index.html` now holds only Settings/Save/Load + the kept load/save
> file-input DOM; dead CSS removed. Zero gameplay DOM UI remains in the Citadel client except
> the file-input. 11 new tests; **browser-verified on real WebGPU** (row renders below the
> resource HUD with correct colours; mode readout updates live entering placement; the HUD
> rect consumes clicks so a placement doesn't fall through underneath).

status: todo
source: the "all GUI in-game" umbrella ([wiki/status.md](../../../wiki/status.md) 2026-06-30 entry) — settings modal, minimap, and occupancy badges turned out to already be in-canvas (2026-07-02 review confirmed; the stale corpus claim is fixed by brief 97 chunk 10). What actually remains is what the code itself says: [main.ts:107](../../../../games/citadel/client/src/main.ts) — "remaining siege/hazard readouts stay DOM for now (other todos)".

## Scope

1. Inventory the remaining DOM readouts around that site (siege status, hazard/threat
   readouts, anything else `document.` in `main.ts` besides the file-input plumbing) —
   verify against current code first.
2. Migrate them onto `@engine/ui` widgets following the established precedents (top HUD
   bar, toasts, build bar, inspect panel) — same placement discipline, a11y mirror where
   the precedent has one.
3. Remove the corresponding DOM elements/CSS once migrated; keep load/save file-input DOM
   (browser requirement).

## Constraints

- Render-only; EDG32 via the palette guard; deterministic (no wall-clock into layout).
- Note: under the cozy default, siege/raid readouts surface rarely — use `cozyThreats:false`
  or the dev hook to force visible states while verifying. If brief 103 (challenge mode)
  lands first, verify under it.

## Acceptance

- Zero gameplay DOM UI left in the Citadel client except the file-input; the migrated
  readouts render in-canvas and update live during a forced raid/fire; @citadel/client
  tests green + a real-browser pass.
