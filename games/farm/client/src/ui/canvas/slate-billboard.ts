/**
 * Farm Valley shop slate billboard — the scrolling sell-offer list, rendered IN-CANVAS via
 * `@engine/ui`.
 *
 * Ports the old DOM `ui/slate-billboard.ts` (`SlateBillboardPanel`) onto the create/refresh
 * pattern established by `createResourceHud` (Citadel) / `createWorldClock` (Farm chunk 1): a
 * retained widget tree built ONCE by {@link createSlateBillboard}, then `refresh(offers)`
 * re-textures rows in place each frame from the latest slate.
 *
 * ## Scrolling
 * The offer list is wrapped in an `@engine/ui` scroll viewport (see `observer-panel.ts`'s module
 * doc for the general pattern): after `computeScrollContent` lays rows out in content-space,
 * `refresh` copies the CURRENTLY VISIBLE rows' nodes (translated to screen-space and clipped to
 * the viewport) into a plain `box` that becomes part of the returned tree.
 *
 * ## Row content (icon + name + price + stock bar)
 * Each row is a `box` (real coloured child labels — a `ButtonNode` can only paint one tint for
 * its whole label, which would lose the price/stock colouring) containing:
 *  - a name label + price label on one line,
 *  - a stock-bar TRACK + FILL pair (two stacked boxes; fill width tracks `remaining/quantity`,
 *    coloured green/gold/red by remaining stock — mirrors the DOM version's bar),
 *  - a "N/M left" caption.
 * The crop icon itself has no widget-tree "sprite" node kind, so — mirroring the hotbar's
 * `drawIcons` extra pass — {@link SlateBillboard.drawIcons} draws each row's icon via
 * `UISurface.sprite` from the existing atlas, positioned from the row's computed `rect` (filled
 * in by `computeLayout`) AFTER `renderTree`. Call it once per frame, after laying out and
 * rendering `root`, passing the same `UISurface`.
 *
 * EDG32-only: every colour is an `EDG.*` constant (mirrors the DOM slate's green/gold/red stock
 * thresholds).
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode, UISurface } from "@engine/ui";
import { scroll, computeScrollContent, clampScroll, scrollBy } from "@engine/ui";
import type { ScrollViewportNode } from "@engine/ui";
import { frameToAtlasId } from "@farm/sim-core/render-systems";
import type { ShopOffer } from "@farm/sim-core/agents/shop-slate";

export type SlateEntry = Pick<ShopOffer, "offerId" | "crop" | "unitPrice" | "quantity" | "remaining">;

/** Fixed visible height (px) of the scrollable offer list. */
const LIST_HEIGHT = 200;
/** Fixed width (px) of the panel (and thus the scroll viewport). */
const LIST_WIDTH = 260;
/** Icon square size (px), matches the DOM slate's 22px icon. */
const ICON_SIZE = 22;
/** Reserved icon column width (px) — the row's info block starts after this. */
const ICON_COLUMN = ICON_SIZE + 8;
/** Stock-bar track dimensions (px). */
const BAR_WIDTH = LIST_WIDTH - ICON_COLUMN - 12;
const BAR_HEIGHT = 5;

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/** Low stock shifts the bar toward gold then red so scarcity reads at a glance (mirrors the DOM). */
function barColor(pct: number): string {
  return pct <= 20 ? EDG.red : pct <= 50 ? EDG.gold : EDG.green;
}

/** Does an atlas frame exist for this crop's mature icon? */
function iconFrameFor(crop: string): string {
  return `crop/${crop}/mature`;
}

interface OfferRowNodes {
  readonly root: ContainerNode;
  readonly nameLbl: LabelNode;
  readonly priceLbl: LabelNode;
  readonly barTrack: ContainerNode;
  readonly barFill: ContainerNode;
  readonly stockLbl: LabelNode;
  /** Crop id for this row's icon draw (empty = no icon this frame). */
  iconCrop: string;
}

/** The retained slate billboard: its root node plus refresh() + wheel() + drawIcons(). */
export interface SlateBillboard {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind all offer rows from the latest slate. Call once per frame.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call, so the host can gate the
   * expensive `computeLayout` + a11y-mirror reconcile behind it.
   */
  refresh(offers: ReadonlyArray<SlateEntry>): boolean;
  /** Scroll the offer list by `dy` px (e.g. from a mouse-wheel event over the panel). */
  wheel(dy: number): void;
  /**
   * Draw each visible row's crop icon over its reserved icon column. Call AFTER `computeLayout` +
   * `renderTree` (needs up-to-date `rect`s) and BEFORE `surface.end()` — mirrors the hotbar's
   * `drawIcons` pass.
   */
  drawIcons(surface: UISurface): void;
}

function buildOfferRow(): OfferRowNodes {
  const nameLbl = label("", { color: EDG.white });
  const priceLbl = label("", { color: EDG.gold });
  const topLine = box({ direction: "row", gap: 6, align: "center" }, [nameLbl, priceLbl]);

  const barFill = box({ width: 0, height: BAR_HEIGHT }, []);
  barFill.background = true;
  const barTrack = box({ width: BAR_WIDTH, height: BAR_HEIGHT }, [barFill]);
  barTrack.background = true;

  const stockLbl = label("", { color: EDG.steel, scale: 1 });

  // Indent the info column past the reserved icon area (icons are drawn in a separate pass).
  const info = box(
    { direction: "column", gap: 2, align: "start", padding: { left: ICON_COLUMN, top: 0, right: 0, bottom: 0 } },
    [topLine, barTrack, stockLbl],
  );

  const root = box({ direction: "column", gap: 0, align: "stretch", padding: { top: 4, bottom: 4, left: 0, right: 0 } }, [
    info,
  ]);

  return { root, nameLbl, priceLbl, barTrack, barFill, stockLbl, iconCrop: "" };
}

/**
 * Build the retained slate billboard widget tree. The tree is created once; `refresh` mutates it
 * per frame (no re-allocation of already-known rows).
 */
export function createSlateBillboard(): SlateBillboard {
  const title = label("Shop Slate", { color: EDG.gold });
  const emptyLbl = label("No offers right now.", { color: EDG.steel });

  const rowCache = new Map<string, OfferRowNodes>();
  const vp: ScrollViewportNode = scroll({ width: LIST_WIDTH, height: LIST_HEIGHT }, []);
  vp.rect = { x: 0, y: 0, width: LIST_WIDTH, height: LIST_HEIGHT };

  const visibleRows = box({ direction: "column", gap: 0, align: "stretch" }, []);
  visibleRows.layout = { width: LIST_WIDTH, height: LIST_HEIGHT };

  const root = panel({ direction: "column", gap: 6, align: "stretch" }, [title, emptyLbl, visibleRows]);

  // Per-node fill colour overrides for the stock bars — keyed by the bar-fill container's id,
  // since `ContainerNode` has no colour field of its own (see `drawIcons`). Rows are also
  // reverse-keyed by their root node's id so `drawIcons` can find a visible row's offer data
  // without a linear scan.
  const barFillColors = new Map<number, string>();
  const rowsByRootId = new Map<number, OfferRowNodes>();

  let changed = false;
  let firstRefresh = true;

  function setText(lbl: LabelNode, text: string): void {
    if (lbl.text !== text) {
      lbl.text = text;
      changed = true;
    }
  }

  function syncVisibleRows(): void {
    computeScrollContent(vp, undefined, { direction: "column", gap: 0 });
    vp.rect = { x: visibleRows.rect.x, y: visibleRows.rect.y, width: LIST_WIDTH, height: LIST_HEIGHT };
    clampScroll(vp);

    const { x: vpX, y: vpY, width: vpW, height: vpH } = vp.rect;
    const ox = vpX - vp.scrollOffset.x;
    const oy = vpY - vp.scrollOffset.y;

    const visible: ContainerNode[] = [];
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
      visible.push(child as ContainerNode);
    }

    if (
      visibleRows.children.length !== visible.length ||
      visibleRows.children.some((c, i) => c !== visible[i])
    ) {
      changed = true;
    }
    visibleRows.children = visible;
  }

  function refresh(offers: ReadonlyArray<SlateEntry>): boolean {
    changed = false;

    const hasOffers = offers.length > 0;
    if (emptyLbl.opacity !== (hasOffers ? 0 : 1)) changed = true;
    emptyLbl.opacity = hasOffers ? 0 : 1;

    const currentIds = new Set(offers.map((o) => o.offerId));
    for (const [id, row] of rowCache) {
      if (!currentIds.has(id)) {
        rowCache.delete(id);
        rowsByRootId.delete(row.root.id);
        barFillColors.delete(row.barFill.id);
        changed = true;
      }
    }

    for (const offer of offers) {
      let row = rowCache.get(offer.offerId);
      if (row === undefined) {
        row = buildOfferRow();
        rowCache.set(offer.offerId, row);
        rowsByRootId.set(row.root.id, row);
        changed = true;
      }

      row.iconCrop = offer.crop;
      setText(row.nameLbl, capitalize(offer.crop));
      setText(row.priceLbl, `${offer.unitPrice}g`);
      setText(row.stockLbl, `${offer.remaining}/${offer.quantity} left`);

      const pct = offer.quantity > 0 ? Math.round((offer.remaining / offer.quantity) * 100) : 0;
      const fillWidth = Math.round((BAR_WIDTH * Math.max(0, Math.min(100, pct))) / 100);
      if (row.barFill.layout.width !== fillWidth) {
        row.barFill.layout = { ...row.barFill.layout, width: fillWidth };
        changed = true;
      }
      // `ContainerNode` has no per-instance fill-colour field (only the shared theme `panelBg`),
      // so the bar fill's scarcity colour (green/gold/red) is painted in `drawIcons` instead of
      // via `renderTree` — record it here, keyed by the fill node's id.
      barFillColors.set(row.barFill.id, barColor(pct));
    }

    const nextChildren = offers.map((o) => rowCache.get(o.offerId)!.root);
    if (vp.children.length !== nextChildren.length || vp.children.some((c, i) => c !== nextChildren[i])) {
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

  function drawIcons(surface: UISurface): void {
    for (const row of visibleRows.children as ContainerNode[]) {
      const nodes = rowsByRootId.get(row.id);
      if (nodes === undefined) continue;

      if (nodes.iconCrop !== "") {
        const { x, y } = row.rect;
        try {
          const atlasId = frameToAtlasId(iconFrameFor(nodes.iconCrop));
          surface.sprite(x, y + 2, ICON_SIZE, ICON_SIZE, atlasId, iconFrameFor(nodes.iconCrop));
        } catch {
          // No atlas frame for this crop — leave the icon column blank (no ASCII fallback glyph
          // exists for crop icons in this panel).
        }
      }

      // Stock-bar fill colour: painted here (not via `renderTree`) because `ContainerNode` has
      // no per-instance fill colour — only the shared theme `panelBg`.
      const fillColor = barFillColors.get(nodes.barFill.id) ?? EDG.green;
      const { x: fx, y: fy, width: fw, height: fh } = nodes.barFill.rect;
      if (fw > 0) surface.rect(fx, fy, fw, fh, fillColor);
    }
  }

  return { root, refresh, wheel, drawIcons };
}
