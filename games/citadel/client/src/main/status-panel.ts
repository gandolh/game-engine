/**
 * Todo 2026-07-15-citadel-status-collapsible-panel: wraps the read-only siege/hazard HUD
 * (`createSiegeHud`, from `../ui/siege-hud`, unmodified) behind an ALWAYS-VISIBLE "Status" toggle
 * `button()`, per Farm Valley's brief-117 collapsible-panel pattern (see
 * `corpus/wiki/player-and-interaction.md` § "Collapsible HUD panels" and § "Panel-layout traps").
 * This composes rather than edits `siege-hud.ts` — mirroring how Farm's `ui/canvas/right-column.ts`
 * wraps `observer-panel.ts`/`slate-billboard.ts`/`event-feed.ts` without touching any of them.
 *
 * Kept as its own module (not inlined in `hud-panels.ts`) so it can be unit-tested with a fake
 * `PanelPrefs` — `hud-panels.ts` transitively imports `sim-client.ts`, which instantiates a live
 * `CitadelSimClient`/`CitadelServerClient` (WebSocket/Worker) at module load, which is not
 * something a plain `vitest` unit test wants to drag in just to exercise a toggle button.
 *
 * ## Structure (mirrors right-column.ts's `Section`)
 * One `box({direction:"column"})` whose `children` are rebuilt WHOLESALE on toggle —
 * `[toggleBtn]` while collapsed, or `[toggleBtn, siegeHudRoot]` while open — never a `.layout`
 * reassignment (trap #3: a partial `{width,height}` literal silently drops `align`/`gap` back to
 * theme defaults).
 *
 * ## Default state
 * Default OPEN (see `panel-prefs.ts`'s `PANEL_DEFAULTS`) — unlike Farm's five panels (farmer
 * list / shop / event feed / matrices: deep, opt-in data the player dives into occasionally),
 * this strip is a single-line AMBIENT-AWARENESS readout (threat level / defense / keep status /
 * active fires / disease) the player watches passively during play, especially mid-siege when
 * it's the primary warning signal. Collapsing it by default would hide exactly the danger cue it
 * exists to surface, so it starts open and is only collapsed on request.
 *
 * ## Shape
 * The returned shape is still exactly `SiegeHud` (`{root, refresh}`), so every existing caller —
 * render-loop.ts's layout/draw block, input.ts's pointer/wheel forwarding via `siegeDispatcher`,
 * the a11y mirror in hud-panels.ts — needs no changes; they only depend on that shape, not on
 * `createSiegeHud`'s specific tree.
 */
import { box, button } from "@engine/ui";
import { createSiegeHud } from "../ui/siege-hud";
import type { SiegeHud, SiegeHudState } from "../ui/siege-hud";
import type { PanelId, PanelPrefs } from "./panel-prefs";

const STATUS_PANEL_ID: PanelId = "status";

/** Build the collapsible "Status" section wrapping a fresh `createSiegeHud()` instance. */
export function createStatusPanel(prefs: PanelPrefs): SiegeHud {
  const inner = createSiegeHud();
  const toggleBtn = button("Status", {
    onActivate: () => {
      prefs.toggle(STATUS_PANEL_ID);
      sync();
      structureDirty = true;
    },
  });
  const sectionBox = box({ direction: "column", gap: 8, align: "stretch" }, [toggleBtn]);

  function sync(): void {
    sectionBox.children = prefs.isOpen(STATUS_PANEL_ID) ? [toggleBtn, inner.root] : [toggleBtn];
  }
  sync();

  // Set by the toggle button; consumed by the next refresh() so the host's computeLayout gate
  // (render-loop.ts) sees `true` even on a frame where the inner HUD's own content didn't change
  // (mirrors right-column.ts's `structureDirty`).
  let structureDirty = false;

  function refresh(state: SiegeHudState): boolean {
    const dirty = structureDirty;
    structureDirty = false;
    // A collapsed panel's content refresh is wasted work (and would needlessly consume `inner`'s
    // OWN firstRefresh sentinel while invisible) — only refresh while open, matching
    // right-column.ts's per-section gating.
    const contentChanged = prefs.isOpen(STATUS_PANEL_ID) ? inner.refresh(state) : false;
    return dirty || contentChanged;
  }

  return { root: sectionBox, refresh };
}
