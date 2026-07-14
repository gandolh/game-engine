/**
 * Farm Valley observer panel — the farmer list + weather/forecast readout, rendered IN-CANVAS
 * via `@engine/ui`.
 *
 * Ports the old DOM `ui/observer/panel.ts` (`ObserverPanel`) onto the create/refresh pattern
 * established by `createResourceHud` (Citadel) / `createWorldClock` (Farm chunk 1): a retained
 * widget tree built ONCE by {@link createObserverPanel}, then `refresh(state)` re-textures rows
 * in place each frame from the latest `ObserverSnapshot`.
 *
 * ## Scrolling
 * The farmer list can run long (up to 21 rows, each multi-line when focused), so it's wrapped in
 * an `@engine/ui` scroll viewport ({@link scroll}/{@link computeScrollContent}). Unlike a normal
 * `UINode` subtree, a `ScrollViewportNode` isn't itself hit-testable/focusable by the shared input
 * dispatcher — so each row is built as a real `button` (clickable, focusable, a11y-mirrored) and,
 * after `computeScrollContent` lays the rows out in content-space, `refresh` copies the CURRENTLY
 * VISIBLE rows' nodes (translated to screen-space and clipped to the viewport) directly into a
 * plain `box` that becomes part of the returned tree — see {@link syncVisibleRows}. This gives the
 * host's ordinary `renderTree`/hit-test/a11y walk correct behaviour for free, while the scroll
 * module's own {@link renderScrollViewport}-equivalent math (translate + cull) still drives which
 * rows are visible and where. `wheel(dy)` scrolls the list; the host wires wheel events into it.
 *
 * ## Row content
 * A `ButtonNode` paints only its own single-colour `label` string (it does not render children —
 * see `@engine/ui`'s `widget/render.ts`), so each row's rich multi-field readout is composed as
 * ONE multi-line label string (`\n`-joined, the bitmap font's native line-break support) rather
 * than nested coloured child labels. This trades the DOM version's per-field colour for a real,
 * click/focus/a11y-capable row — the acceptance-critical property for this panel.
 *
 * ## Farmer selection (focus-follow)
 * Clicking a row toggles "follow" for that farmer via `actions.onSelectFarmer(id | null)` — the
 * SAME command the old DOM row `click` handler drove (integration chunk wires this to the existing
 * focus-farmer command). Clicking the already-focused row un-follows (passes `null`), mirroring the
 * DOM panel's toggle behaviour. The "Reset view" button (old `resetBtn`) is ported as a real button.
 *
 * EDG32-only: every colour is an `EDG.*` constant.
 */
import { EDG } from "@engine/core";
import { box, button, label, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, LabelNode } from "@engine/ui";
import { scroll, computeScrollContent, clampScroll, scrollBy } from "@engine/ui";
import type { ScrollViewportNode } from "@engine/ui";
import type { ObserverSnapshot } from "@farm/sim-core/snapshot";

/** Fixed visible height (px) of the scrollable farmer list. */
const LIST_HEIGHT = 280;
/**
 * Fixed width (px) of the panel (and thus the scroll viewport) — shared with `slate-billboard.ts`
 * and `event-feed.ts` (all three stack in `right-column.ts` and read as one consistent-width
 * column). Was 260, sized for the old 5px-glyph bitmap font; a multi-field row like
 * `farmerRowText`'s `"State: DELIBERATE  AP: 8/10 (penalty)"` line (38 chars) already nearly
 * filled 260px at that font's ~6px advance and overflows it outright at the authored UNSCII
 * font's 9px advance — bumped by the same ratio (`390 = 260 * 9/6`) so regular rows fit again.
 */
const LIST_WIDTH = 390;

/** Callbacks into the host's command path — mirrors the old DOM `setOnFarmerClick`. */
export interface ObserverPanelActions {
  /** Follow (or, passing `null`, unfollow) a farmer — the existing focus-farmer command. */
  onSelectFarmer(id: number | null): void;
}

/** The retained observer panel: its root node plus refresh() + wheel(). */
export interface ObserverPanel {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind the header/weather/forecast/rows from the latest snapshot. Call once per frame.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call, so the host can gate the
   * expensive `computeLayout` + a11y-mirror reconcile behind it.
   */
  refresh(snapshot: ObserverSnapshot): boolean;
  /** Scroll the farmer list by `dy` px (e.g. from a mouse-wheel event over the panel). */
  wheel(dy: number): void;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function cropSummary(crops: ObserverSnapshot["farmers"][number]["crops"]): string {
  const parts = Object.entries(crops)
    .filter(([, qty]) => (qty ?? 0) > 0)
    .map(([k, qty]) => `${k.slice(0, 3).toUpperCase()}:${qty}`);
  return parts.length > 0 ? parts.join(" ") : "-";
}

/** Compose one farmer's row text (multi-line; the `\n`-joined lines the bitmap font wraps natively). */
function farmerRowText(farmer: ObserverSnapshot["farmers"][number], focused: boolean): string {
  const gh = farmer.hasGreenhouse ? " [GH]" : "";
  const s = farmer.skills;
  const apText = farmer.apPenaltyPending
    ? `AP: ${farmer.apCurrent}/${farmer.apMax} (penalty)`
    : `AP: ${farmer.apCurrent}/${farmer.apMax}`;
  const lines = [
    `${farmer.name} (${farmer.personality})`,
    `Gold: ${farmer.gold}  Crops: ${cropSummary(farmer.crops)}`,
    `State: ${farmer.fsm}  ${apText}`,
    `Region: ${farmer.region}`,
    `Skills: Fa${s.farming} Fo${s.foraging} Fi${s.fishing} Mi${s.mining}${gh}`,
  ];
  if (focused) {
    const current = farmer.currentIntention ?? "(idle)";
    const next = farmer.nextIntention ?? "(none)";
    const reasonLines = farmer.reasons.length > 0 ? farmer.reasons.join("; ") : "(no reason)";
    lines.push(`Now: ${current} | Next: ${next} | ${reasonLines}`);
  }
  return lines.join("\n");
}

/**
 * Build the retained observer panel widget tree and wire the reset button + row clicks to
 * `actions`. The tree is created once; `refresh` mutates it per frame (no re-allocation of
 * already-known rows).
 */
export function createObserverPanel(actions: ObserverPanelActions): ObserverPanel {
  const headerLbl = label("Day 1", { color: EDG.white });
  const hintLbl = label("Click a farmer to follow them", { color: EDG.steel });
  const resetBtn = button("Reset view", {
    onActivate: () => {
      focusedId = null;
      actions.onSelectFarmer(null);
    },
  });
  const weatherLbl = label("", { color: EDG.silver });
  const forecastLbl = label("", { color: EDG.steel });

  const rowCache = new Map<number, ButtonNode>();
  const vp: ScrollViewportNode = scroll({ width: LIST_WIDTH, height: LIST_HEIGHT }, []);
  // The viewport has a fixed size (unlike a normal child, it isn't sized by a parent
  // `computeLayout` pass here) — pin `rect` up front so `computeScrollContent`/`clampScroll`
  // have real dimensions to clip against before the first `refresh`.
  vp.rect = { x: 0, y: 0, width: LIST_WIDTH, height: LIST_HEIGHT };
  // The tree-visible mirror of `vp`'s currently-visible rows, translated to screen space — see
  // module doc "Scrolling". Sits where the scroll viewport would visually be.
  const visibleRows = box({ direction: "column", gap: 0, align: "stretch" }, []);
  visibleRows.layout = { width: LIST_WIDTH, height: LIST_HEIGHT };

  const root = panel({ direction: "column", gap: 6, align: "stretch" }, [
    headerLbl,
    hintLbl,
    resetBtn,
    weatherLbl,
    forecastLbl,
    visibleRows,
  ]);

  let focusedId: number | null = null;
  let changed = false;
  let firstRefresh = true;

  function setText(lbl: LabelNode, text: string): void {
    if (lbl.text !== text) {
      lbl.text = text;
      changed = true;
    }
  }

  function selectFarmer(id: number): void {
    if (focusedId === id) {
      focusedId = null;
      actions.onSelectFarmer(null);
    } else {
      focusedId = id;
      actions.onSelectFarmer(id);
    }
  }

  /**
   * Lay the rows out in the scroll viewport's content space, then splice the currently-visible
   * ones (translated to `vp.rect`'s screen position, minus scroll offset) into `visibleRows` —
   * mirroring `renderScrollViewport`'s translate+cull math so hit-test/a11y see exactly what's
   * painted.
   */
  function syncVisibleRows(): void {
    computeScrollContent(vp, undefined, { direction: "column", gap: 0 });
    // `visibleRows.rect` holds last frame's laid-out screen position (this frame's `computeLayout`
    // hasn't run yet when `refresh` is called) — good enough for a fixed-size, rarely-moving panel;
    // it settles to the correct position by the second frame and every frame thereafter.
    vp.rect = { x: visibleRows.rect.x, y: visibleRows.rect.y, width: LIST_WIDTH, height: LIST_HEIGHT };
    clampScroll(vp);

    const { x: vpX, y: vpY, width: vpW, height: vpH } = vp.rect;
    const ox = vpX - vp.scrollOffset.x;
    const oy = vpY - vp.scrollOffset.y;

    const visible: ButtonNode[] = [];
    for (const child of vp.children) {
      const translated = {
        x: child.rect.x + ox,
        y: child.rect.y + oy,
        width: child.rect.width,
        height: child.rect.height,
      };
      const overlaps =
        translated.x < vpX + vpW &&
        translated.x + translated.width > vpX &&
        translated.y < vpY + vpH &&
        translated.y + translated.height > vpY;
      if (!overlaps) continue;
      child.rect = translated;
      visible.push(child as ButtonNode);
    }

    if (
      visibleRows.children.length !== visible.length ||
      visibleRows.children.some((c, i) => c !== visible[i])
    ) {
      changed = true;
    }
    visibleRows.children = visible;
  }

  function refresh(snapshot: ObserverSnapshot): boolean {
    changed = false;

    const seasonLabel = capitalize(snapshot.season);
    setText(headerLbl, seasonLabel.length > 0 ? `Day ${snapshot.day} — ${seasonLabel}` : `Day ${snapshot.day}`);
    setText(
      weatherLbl,
      `Weather: ${snapshot.weather.condition} (x${snapshot.weather.multiplier.toFixed(2)})`,
    );
    const forecastLines = snapshot.forecast
      .map((f) => `${f.condition} ~${Math.round(f.confidence * 100)}%`)
      .join(", ");
    setText(forecastLbl, forecastLines.length > 0 ? `Forecast: ${forecastLines}` : "Forecast: -");

    const focused = focusedId !== null ? snapshot.farmers.find((f) => f.id === focusedId) : undefined;
    if (focusedId !== null && focused === undefined) {
      // The followed farmer left the snapshot (despawned) — drop the follow.
      focusedId = null;
    }
    const resetLabel = focused !== undefined ? `Unfollow ${focused.name}` : "Reset view";
    if (resetBtn.label !== resetLabel) {
      resetBtn.label = resetLabel;
      changed = true;
    }
    const hintVisible = focused === undefined;
    if (hintVisible !== (hintLbl.opacity !== 0)) changed = true;
    hintLbl.opacity = hintVisible ? 1 : 0;

    const sorted = [...snapshot.farmers].sort((a, b) => a.id - b.id);
    const currentIds = new Set(sorted.map((f) => f.id));
    for (const id of rowCache.keys()) {
      if (!currentIds.has(id)) {
        rowCache.delete(id);
        changed = true;
      }
    }

    for (const farmer of sorted) {
      let row = rowCache.get(farmer.id);
      if (row === undefined) {
        row = button("", { onActivate: () => selectFarmer(farmer.id) });
        rowCache.set(farmer.id, row);
        changed = true;
      }

      const isFocused = farmer.id === focusedId;
      const text = farmerRowText(farmer, isFocused);
      if (row.label !== text) {
        row.label = text;
        changed = true;
      }
      // `ButtonNode` has no per-instance outline colour knob (only the theme's per-state fill);
      // pin the followed row to the "active" (pressed-look) state as the closest built-in
      // equivalent to the DOM panel's gold outline/highlight.
      row.state = isFocused ? "active" : "normal";
    }

    // Rebuild the scroll content children in id-sort order (cheap — farmer count is small/fixed).
    const nextChildren = sorted.map((f) => rowCache.get(f.id)!);
    if (
      vp.children.length !== nextChildren.length ||
      vp.children.some((c, i) => c !== nextChildren[i])
    ) {
      vp.children = nextChildren;
      changed = true;
    }

    syncVisibleRows();

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  function wheel(dy: number): void {
    scrollBy(vp, 0, dy);
    syncVisibleRows();
  }

  return { root, refresh, wheel };
}
