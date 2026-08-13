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
 * tool/crop/fish icon AND the selected-slot highlight are drawn as raw quads through the
 * `UISurface`, positioned from each slot's computed `rect` (filled in by `computeLayout`). That
 * drawing lives in an OVERLAY `custom` node appended last to `root` (see `createHotbar`): it fills
 * the panel's inner box out of flow and paints during `renderTree`, on top of the slots — so there
 * is no separate post-`renderTree` pass and no layout disturbance. A slot with no sprite frame
 * (`frame === ""`, e.g. an empty slot) falls back to the ASCII `glyph` text already baked into a
 * label — no icon draw for that slot.
 *
 * EDG32-only: every colour is an `EDG.*` constant (mirrors the DOM hotbar's selected/dim states).
 */
import { EDG } from "@engine/core";
import { box, custom, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode, UISurface } from "@engine/ui";
import { frameToAtlasId } from "@farm/sim-core/render-systems";
import type { PlayerHotbar, HotbarSlotState } from "@farm/sim-core/snapshot";

const HOTBAR_SLOT_COUNT = 8;

// Wide enough for the longest COMMON caption ("Pickaxe"/"Pumpkin", 7 chars) at the body font's
// 9px advance (62px) + the slot's 4px horizontal padding, with a little breathing room — was 48,
// sized for the old 5px-glyph font's ~6px advance (41px for the same word). A handful of rare
// long captions ("Winter Squash", "Golden Beans") still overflow at any reasonable slot width;
// that's pre-existing (they overflowed the old 48px slot too) and out of scope here.
const SLOT_WIDTH = 64;
// badge(10) + icon(26) + caption(10) + count(10) + 3 gaps + 6 vertical padding = 65.
// Was 58, which was only ever enough because the `glyph` node reserved a single TEXT LINE
// rather than the icon's real 26px — so the sprite drawn over it spilled onto the caption.
const SLOT_HEIGHT = 70;
const ICON_SIZE = 26;
/** Pixels the pointer must travel from press before a click becomes a drag (so slot clicks/taps
 * and the world tool-use they might overlap are never mistaken for a drag). */
const DRAG_THRESHOLD = 5;

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

/**
 * Drag-to-rearrange wiring (reinvention: drag-from-world hotbar). The belt is always visible, so —
 * unlike the inventory modal — the hotbar installs its own capture-phase listeners and reuses the
 * SAME owner-gated `swap-slots` message. A press that never moves past {@link DRAG_THRESHOLD} is
 * NOT a drag, so it doesn't interfere with the world tool-use click that may sit under the belt.
 */
export interface HotbarActions {
  /** The game canvas (drag listeners attach here, capture phase). */
  canvas: HTMLCanvasElement;
  /** Owner-gated slot swap (host wires this to `SimClient.swapSlots`). */
  swapSlots(from: number, to: number): void;
  /** Whether the local client owns Pip (gates the drag). */
  isOwner(): boolean;
}

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
  /** Remove the capture-phase drag listeners (call when dismounting). */
  destroy(): void;
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
  // The glyph node RESERVES the icon's box (drawIcons paints an ICON_SIZE sprite over its rect).
  // Without the fixed size it sized to its own empty text — one line tall — and the 26px sprite
  // drawn on it spilled 16px down onto the caption, printing the item art over its own name.
  // It still carries the ASCII fallback text for slots with no atlas frame.
  const glyph = label("", {
    color: EDG.silver,
    layout: { width: ICON_SIZE, height: ICON_SIZE },
  });
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
export function createHotbar(actions: HotbarActions): Hotbar {
  const { canvas, swapSlots, isOwner } = actions;
  const slots: SlotEls[] = [];
  for (let i = 0; i < HOTBAR_SLOT_COUNT; i++) slots.push(buildSlot(i));

  // Slot icons, the selected-slot border, and the drag ghost paint via an OVERLAY custom node
  // (last child → drawn on top of the slots during `renderTree`, filling the panel's inner box
  // without joining its row flow). Folds the old separate drawIcons/drawGhost post-passes into the
  // widget tree (engine-ui backlog item 1). The ghost draws at the live cursor position, which may
  // fall outside the panel box — fine, custom-node draws aren't clipped.
  const overlay = custom((surface) => {
    drawIconsInto(surface);
    drawGhostInto(surface);
  }, { overlay: true });
  const root = panel(
    { direction: "row", align: "end", gap: 5, padding: 6 },
    [...slots.map((s) => s.root), overlay],
  );

  let changed = false;
  let firstRefresh = true;

  // Drag-to-rearrange state (reinvention). `dragFrom` is the picked-up slot; `dragActive` flips
  // once the pointer moves past DRAG_THRESHOLD so a plain click never counts as a drag.
  let dragFrom: number | null = null;
  let dragActive = false;
  let pressX = 0, pressY = 0, dragX = 0, dragY = 0;

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

  function drawIconsInto(surface: UISurface): void {
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

  /** Canvas-relative CSS px of a mouse event (no devicePixelRatio multiply — matches the surface). */
  function eventToCssPx(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Which visible slot index contains screen point (x,y), or null. Uses each slot's laid-out rect. */
  function slotIndexAt(x: number, y: number): number | null {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      if (s.root.opacity === 0) continue;
      const { x: rx, y: ry, width, height } = s.root.rect;
      if (x >= rx && x < rx + width && y >= ry && y < ry + height) return i;
    }
    return null;
  }

  /** Draw the dragged slot's icon following the cursor (runs after the icon pass in the overlay). */
  function drawGhostInto(surface: UISurface): void {
    if (!dragActive || dragFrom === null) return;
    const s = slots[dragFrom];
    if (s === undefined || s.iconFrame === "") return;
    let atlasId: string;
    try {
      atlasId = frameToAtlasId(s.iconFrame);
    } catch {
      return;
    }
    surface.sprite(dragX - ICON_SIZE / 2, dragY - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE, atlasId, s.iconFrame);
  }

  // Capture-phase listeners: a press that starts on a filled hotbar slot arms a potential drag.
  // Only once it moves past the threshold do we own the gesture (block the world) and swap on drop.
  // A press that never moves falls through untouched, so the world tool-use click still fires.
  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0 || !isOwner()) return;
    const { x, y } = eventToCssPx(e);
    const idx = slotIndexAt(x, y);
    if (idx === null) return;
    const s = slots[idx]!;
    if (s.iconFrame === "" && s.glyph.text === "") return; // empty slot — nothing to drag
    dragFrom = idx;
    dragActive = false;
    pressX = x; pressY = y; dragX = x; dragY = y;
  }

  function onMouseMove(e: MouseEvent): void {
    if (dragFrom === null) return;
    const { x, y } = eventToCssPx(e);
    dragX = x; dragY = y;
    if (!dragActive && (Math.abs(x - pressX) > DRAG_THRESHOLD || Math.abs(y - pressY) > DRAG_THRESHOLD)) {
      dragActive = true;
    }
    if (dragActive) e.stopImmediatePropagation();
  }

  function onMouseUp(e: MouseEvent): void {
    if (dragFrom === null) return;
    const from = dragFrom;
    const wasDragging = dragActive;
    dragFrom = null;
    dragActive = false;
    if (e.button !== 0) return;
    if (!wasDragging) return; // a plain click — let the world/other handlers act
    e.stopImmediatePropagation();
    const { x, y } = eventToCssPx(e);
    const to = slotIndexAt(x, y);
    if (to === null || to === from) return;
    if (isOwner()) swapSlots(from, to);
  }

  window.addEventListener("mousedown", onMouseDown, { capture: true });
  window.addEventListener("mousemove", onMouseMove, { capture: true });
  window.addEventListener("mouseup", onMouseUp, { capture: true });

  function destroy(): void {
    window.removeEventListener("mousedown", onMouseDown, { capture: true } as EventListenerOptions);
    window.removeEventListener("mousemove", onMouseMove, { capture: true } as EventListenerOptions);
    window.removeEventListener("mouseup", onMouseUp, { capture: true } as EventListenerOptions);
  }

  return { root, refresh, destroy };
}
