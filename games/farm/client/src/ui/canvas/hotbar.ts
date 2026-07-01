/**
 * Farm Valley hotbar — the bottom-centre 8-slot belt (+ selection highlight), rendered
 * IN-CANVAS via `@engine/ui`.
 *
 * Ports the old DOM `ui/hotbar.ts` (`HotbarPanel`) onto the retained `@engine/ui` widget-tree
 * pattern established by `createResourceHud` (Citadel) / `createWorldClock` (Farm chunk 1):
 * the tree is built ONCE by {@link createHotbar}, then `refresh(state)` re-textures its
 * labels/colours/opacity in place each frame from the latest `PlayerHotbar` snapshot.
 *
 * DISPLAY + reflect-selection ONLY in this chunk — no drag-drop (a later chunk reuses the
 * existing `swap-slots` message for that). This module exports no `actions` because there is
 * nothing to activate yet; the parameter is kept (empty options bag) so the signature matches
 * the `create<Panel>(actions?)` shape the integration chunk expects.
 *
 * ## Icons + selection highlight
 * The widget tree has no "sprite" node kind (only panel/box/label/button/slider/checkbox), and
 * containers have no per-node colour override (background colour is theme-global) — so both the
 * tool/crop/fish icon AND the selected-slot highlight are drawn as raw quads directly through the
 * `UISurface`, positioned from each slot's computed `rect` (filled in by `computeLayout`), as a
 * render pass that runs AFTER `renderTree` (so the highlight/icon paint over the slot's themed
 * background). {@link Hotbar.drawIcons} is that pass; the host calls it once per frame, after
 * laying out and rendering `root`, passing the same `UISurface`, before `surface.end()`. A slot
 * with no sprite frame (`frame === ""`, e.g. an empty slot) falls back to the ASCII `glyph` text
 * already baked into a label — no icon draw call for that slot.
 *
 * EDG32-only: every colour is an `EDG.*` constant (mirrors the DOM hotbar's selected/dim states).
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode, UISurface } from "@engine/ui";
import { frameToAtlasId } from "@farm/sim-core/render-systems";
import type { PlayerHotbar, HotbarSlotState } from "@farm/sim-core/snapshot";

const HOTBAR_SLOT_COUNT = 8;

const SLOT_WIDTH = 48;
const SLOT_HEIGHT = 58;
const ICON_SIZE = 26;

/** One pooled slot's widget nodes + the icon-frame it should draw (kept out of the tree). */
interface SlotEls {
  readonly root: ContainerNode;
  readonly badge: LabelNode;
  readonly glyph: LabelNode;
  readonly caption: LabelNode;
  readonly count: LabelNode;
  /** Atlas frame to draw over `glyph`'s rect this frame; empty string = no icon (glyph text shows). */
  iconFrame: string;
  /** Whether this slot is the currently-selected hotbar slot (drives the gold border overlay). */
  selected: boolean;
}

/** No activatable actions yet (display + reflect-selection only) — kept for signature parity. */
export type HotbarActions = Record<string, never>;

/** The retained hotbar: its root node (laid out + rendered by the host) plus refresh(). */
export interface Hotbar {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind all slot labels/colours/opacity from the latest hotbar snapshot. Call once per frame.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call (any label text changed), so
   * the host can gate the expensive `computeLayout` + a11y-mirror reconcile behind it. Selection/
   * dimming/icon changes alone don't move anything, so they don't mark it changed. The first call
   * always returns `true` (initial layout). `renderTree`/`surface` must still run every frame.
   */
  refresh(state: PlayerHotbar | null): boolean;
  /**
   * Draw each slot's atlas-sprite icon over its glyph area. Call AFTER `computeLayout` +
   * `renderTree` (needs up-to-date `rect`s) and BEFORE `surface.end()` — see the module doc.
   * Only slots whose latest `refresh()` resolved a sprite frame draw anything; slots with no
   * sprite frame keep their ASCII `glyph` text (already painted by `renderTree`).
   */
  drawIcons(surface: UISurface): void;
}

function setText(lbl: LabelNode, text: string): boolean {
  if (lbl.text === text) return false;
  lbl.text = text;
  return true;
}
function setColor(lbl: LabelNode, color: string): void {
  if (lbl.color !== color) lbl.color = color;
}

/** Does an atlas frame exist for this slot's icon? Empty frame = no icon (fall back to glyph). */
function hasSpriteFrame(frame: string): boolean {
  if (frame === "") return false;
  try {
    frameToAtlasId(frame);
    return true;
  } catch {
    return false;
  }
}

function buildSlot(index: number): SlotEls {
  const badge = label(`${index + 1}`, { color: EDG.slate, scale: 1 });
  const glyph = label("", { color: EDG.silver });
  const caption = label("", { color: EDG.steel });
  const count = label("", { color: EDG.silver });

  const root = box(
    {
      direction: "column",
      align: "center",
      gap: 1,
      width: SLOT_WIDTH,
      height: SLOT_HEIGHT,
      padding: { top: 3, right: 2, bottom: 3, left: 2 },
    },
    [badge, glyph, caption, count],
  );
  root.background = true;

  return { root, badge, glyph, caption, count, iconFrame: "", selected: false };
}

/**
 * Build the retained hotbar widget tree (fixed `HOTBAR_SLOT_COUNT` slots — the sim always sends
 * that many, so no pooling/resizing is needed, unlike the old DOM panel's dynamic `ensureSlots`).
 * The tree is created once; `refresh` mutates it per frame (no re-allocation).
 */
export function createHotbar(_actions?: HotbarActions): Hotbar {
  const slots: SlotEls[] = [];
  for (let i = 0; i < HOTBAR_SLOT_COUNT; i++) slots.push(buildSlot(i));

  const root = panel(
    { direction: "row", align: "end", gap: 5, padding: 6 },
    slots.map((s) => s.root),
  );

  let changed = false;
  let firstRefresh = true;

  function refresh(state: PlayerHotbar | null): boolean {
    changed = false;

    if (state === null) {
      // Nothing to show — hide every slot (opacity 0) without touching layout dimensions.
      for (const s of slots) {
        if (s.root.opacity !== 0) changed = true;
        s.root.opacity = 0;
      }
      const result = changed || firstRefresh;
      firstRefresh = false;
      return result;
    }

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      if (s.root.opacity !== 1) changed = true;
      s.root.opacity = 1;

      const slot: HotbarSlotState | undefined = state.slots[i];
      if (slot === undefined) {
        if (setText(s.glyph, "")) changed = true;
        if (setText(s.caption, "")) changed = true;
        if (setText(s.count, "")) changed = true;
        s.iconFrame = "";
        s.selected = false;
        continue;
      }

      const selected = i === state.selected;
      const dim = !slot.available && !selected;
      s.selected = selected;

      if (hasSpriteFrame(slot.frame)) {
        s.iconFrame = slot.frame;
        if (setText(s.glyph, "")) changed = true;
      } else {
        s.iconFrame = "";
        if (setText(s.glyph, slot.glyph)) changed = true;
      }
      if (setText(s.caption, slot.label)) changed = true;
      if (setText(s.count, slot.text)) changed = true;

      setColor(s.badge, EDG.slate);
      setColor(s.caption, dim ? EDG.slate : EDG.steel);
      setColor(s.count, dim ? EDG.slate : EDG.silver);

      s.root.opacity = dim ? 0.45 : 1;
    }

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  function drawIcons(surface: UISurface): void {
    const SELECTED_BORDER = 2;
    for (const s of slots) {
      if (s.root.opacity === 0) continue;

      if (s.selected) {
        // Gold border overlay around the slot (mirrors the old DOM hotbar's selected border-color).
        const { x, y, width, height } = s.root.rect;
        surface.rect(x, y, width, SELECTED_BORDER, EDG.gold);
        surface.rect(x, y + height - SELECTED_BORDER, width, SELECTED_BORDER, EDG.gold);
        surface.rect(x, y, SELECTED_BORDER, height, EDG.gold);
        surface.rect(x + width - SELECTED_BORDER, y, SELECTED_BORDER, height, EDG.gold);
      }

      if (s.iconFrame === "") continue;
      const { x, y, width } = s.glyph.rect;
      // Centre the icon within the label's measured width (the label itself draws empty text).
      const ix = x + Math.max(0, (width - ICON_SIZE) / 2);
      let atlasId: string;
      try {
        atlasId = frameToAtlasId(s.iconFrame);
      } catch {
        continue;
      }
      surface.sprite(ix, y, ICON_SIZE, ICON_SIZE, atlasId, s.iconFrame);
    }
  }

  return { root, refresh, drawIcons };
}
