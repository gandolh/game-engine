/**
 * Farm Valley inventory — the E-toggled item grid + drag-to-rearrange, rendered IN-CANVAS via
 * `@engine/ui`.
 *
 * Ports the old DOM `ui/inventory.ts` (`InventoryPanel`, HTML5 drag-drop) onto the retained
 * `@engine/ui` widget-tree + host pattern. The modal is a full-screen backdrop panel holding a
 * grid of slot boxes (rows = the inventory layout; the first `hotbarSize` slots are the hotbar
 * belt). `refresh(inv)` re-textures the slots in place each frame from the latest
 * `PlayerInventory` snapshot — layout is reflected from the snapshot, never optimistic local
 * state (exactly like the DOM inventory did).
 *
 * ## Drag-to-swap (reuses the existing `swap-slots` message)
 * The DOM version used HTML5 drag-drop; canvas has none, so this module installs its OWN
 * capture-phase mouse listeners on the canvas that implement: mousedown on a filled slot →
 * drag ghost follows the cursor → mouseup on a target slot → `swapSlots(from, to)` (which the
 * host wires to `SimClient.swapSlots`, owner-gated). Slot hit-testing is done against each slot
 * box's laid-out `rect`. The drag ghost is drawn as a raw sprite through the `UISurface` from the
 * modal's OVERLAY custom node (see below). No new protocol / sim state — the swap is authoritative
 * on the sim; the next snapshot reflects the new layout.
 *
 * The modal registers a UI root with the host so the grid is a11y-mirrored. Pointer handling is
 * done by the inventory's OWN capture-phase listeners on `window` (which fire BEFORE the host's
 * canvas-capture listeners, since capture propagates root→target): while the inventory is open it
 * owns slot presses/drags + backdrop-click-to-close and `stopImmediatePropagation`s them so
 * neither the host nor the world also acts. When idle (no drag) it doesn't block, so the rest of
 * the UI keeps working.
 *
 * ## Icons
 * A slot's atlas-sprite icon has no widget-tree "sprite" node kind, so — mirroring the hotbar —
 * icons (and the selected border + drag ghost) paint via an OVERLAY `custom` node appended last to
 * the modal: it fills the modal's inner box out of flow and draws on top of the slots during
 * `renderTree`, so there is no separate post-`renderTree` pass. Slots with no sprite frame keep
 * their ASCII glyph (a real label).
 *
 * EDG32-only: every colour is an `EDG.*` constant (mirrors the DOM inventory's selected/hotbar/
 * empty states).
 */
import { EDG } from "@engine/core";
import { box, custom, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode, UINode, UISurface } from "@engine/ui";
import { frameToAtlasId } from "@farm/sim-core/render-systems";
import type { PlayerInventory, ItemSlotState } from "@farm/sim-core/snapshot";
import type { UIHost, UIRootHandle } from "./ui-host";

// Kept 4px wider than the hotbar's SLOT_WIDTH (its own slots are a touch roomier), scaled up
// the same way for the wider body font — see hotbar.ts's SLOT_WIDTH comment.
const SLOT_WIDTH = 68;
const SLOT_HEIGHT = 60;
const SLOT_GAP = 5;
const ICON_SIZE = 30;

/** One pooled slot's widget nodes + the icon frame it should draw + its inventory index. */
interface SlotEls {
  readonly root: ContainerNode;
  readonly glyph: LabelNode;
  readonly caption: LabelNode;
  readonly count: LabelNode;
  iconFrame: string;
  /** Whether this slot is the selected hotbar slot (gold border overlay). */
  selected: boolean;
  /** Whether this slot is inside the hotbar belt (first `hotbarSize` slots). */
  inHotbar: boolean;
  /** Whether the slot holds an item (draggable + not dimmed as empty). */
  filled: boolean;
}

/** Options for {@link createInventory}. */
export interface InventoryOptions {
  /** The game canvas (the drag listeners attach here, in capture phase). */
  canvas: HTMLCanvasElement;
  /** The shared UI host — the modal registers a root; drag hit-testing reuses its dispatcher. */
  host: UIHost;
  /** Optional hidden-DOM a11y mount for the modal grid. */
  a11yMount?: HTMLElement | null;
  /** Perform an owner-gated slot swap (host wires this to `SimClient.swapSlots`). */
  swapSlots(from: number, to: number): void;
  /** Whether the local client owns Pip (only the owner may drag-swap). */
  isOwner(): boolean;
}

/** The retained inventory modal: root/refresh/toggle. Icons + drag ghost paint via an overlay
 *  custom node inside the modal tree (no separate draw pass — see the module doc). */
export interface Inventory {
  /** The modal root while open, or `null` while closed (its registered dispatcher is inert). */
  getRoot(): ContainerNode | null;
  /** The registered root handle (its a11y mirror). */
  readonly rootHandle: UIRootHandle;
  /**
   * Re-bind all slots from the latest inventory snapshot. Call once per frame while open.
   * Returns `true` when LAYOUT-AFFECTING content changed (slot count / any label text), so the
   * host can gate `computeLayout` + a11y-mirror reconcile behind it.
   */
  refresh(inv: PlayerInventory | null): boolean;
  isOpen(): boolean;
  setOpen(v: boolean): void;
  toggle(): void;
  /** Remove the capture-phase drag listeners. */
  destroy(): void;
}

function setText(lbl: LabelNode, text: string): boolean {
  if (lbl.text === text) return false;
  lbl.text = text;
  return true;
}

function hasSpriteFrame(frame: string): boolean {
  if (frame === "") return false;
  try {
    frameToAtlasId(frame);
    return true;
  } catch {
    return false;
  }
}

function buildSlot(): SlotEls {
  // The glyph node RESERVES the icon's box (drawIcons paints an ICON_SIZE sprite over its rect,
  // exactly like hotbar.ts's buildSlot). Without the fixed size it sized to its own empty text —
  // one line tall (~10px) — and the 30px sprite drawn on it spilled ~20px down onto the caption
  // AND count labels below, printing the item art over its own name/quantity.
  const glyph = label("", { color: EDG.silver, layout: { width: ICON_SIZE, height: ICON_SIZE } });
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
    [glyph, caption, count],
  );
  root.background = true;
  return { root, glyph, caption, count, iconFrame: "", selected: false, inHotbar: false, filled: false };
}

/** Convert a mouse event to canvas-relative CSS-logical px (no devicePixelRatio multiply). */
function eventToCssPx(canvas: HTMLCanvasElement, e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/**
 * Build the retained inventory modal, register it as a UI root, and install the capture-phase
 * drag-to-swap listeners. Slots grow/shrink to match the snapshot's slot count on `refresh`.
 */
export function createInventory(opts: InventoryOptions): Inventory {
  const { canvas, host, swapSlots, isOwner } = opts;

  const title = label("Inventory", { color: EDG.gold });
  const hint = label(
    "Drag items to rearrange - top row is the hotbar - E or Esc to close",
    { color: EDG.slate },
  );
  const gridBox = box({ direction: "column", gap: SLOT_GAP, align: "center" }, []);
  // Slot icons, selected borders, and the drag ghost paint via an OVERLAY custom node (last child →
  // on top of the grid during `renderTree`, filling the modal's inner box out of flow). Folds the
  // old separate drawIcons/drawGhost post-passes into the widget tree (engine-ui backlog item 1).
  const iconsOverlay = custom((surface) => {
    drawIconsInto(surface);
    drawGhostInto(surface);
  }, { overlay: true });
  const modal = panel({ direction: "column", gap: 8, align: "center", padding: 16 }, [
    title,
    gridBox,
    hint,
    iconsOverlay,
  ]);

  let open = false;
  const slots: SlotEls[] = [];
  let hotbarSize = 8;
  let changed = false;
  let firstRefresh = true;

  // Drag state (screen px + slot indices). Reflect layout from the snapshot only; the ghost is
  // pure render feedback and never mutates the shown slots.
  let dragFrom: number | null = null;
  let dragActive = false;
  let dragX = 0;
  let dragY = 0;
  let pressX = 0;
  let pressY = 0;
  const DRAG_THRESHOLD = 4;

  function getRoot(): ContainerNode | null {
    return open ? modal : null;
  }

  const rootHandle = host.registerRoot({
    getRoot,
    a11yMount: opts.a11yMount ?? null,
    a11yLabel: "Inventory",
  });

  /** Which slot index contains screen point (x,y), or null. Uses each slot's laid-out rect. */
  function slotIndexAt(x: number, y: number): number | null {
    if (!open) return null;
    for (let i = 0; i < slots.length; i++) {
      const { x: rx, y: ry, width, height } = slots[i]!.root.rect;
      if (x >= rx && x < rx + width && y >= ry && y < ry + height) return i;
    }
    return null;
  }

  function ensureSlots(n: number, columns: number): void {
    if (slots.length !== n) {
      slots.length = 0;
      for (let i = 0; i < n; i++) slots.push(buildSlot());
      changed = true;
    }
    // Re-chunk the flat slot list into rows of `columns` (mirrors the DOM grid's columns = hotbar).
    const cols = Math.max(1, columns);
    const rows: UINode[] = [];
    for (let i = 0; i < slots.length; i += cols) {
      const rowSlots = slots.slice(i, i + cols).map((s) => s.root);
      rows.push(box({ direction: "row", gap: SLOT_GAP, align: "center" }, rowSlots));
    }
    // Only rebuild the row structure when the child count changes (slot count / columns changed).
    if (gridBox.children.length !== rows.length) {
      gridBox.children = rows;
      changed = true;
    } else {
      // Row containers are fresh each call but hold the same stable slot nodes; keep the old row
      // boxes to avoid churn unless the layout shape changed.
      gridBox.children = rows;
    }
  }

  function refresh(inv: PlayerInventory | null): boolean {
    changed = false;
    if (!open || inv === null) {
      const result = changed || firstRefresh;
      firstRefresh = false;
      return result;
    }

    hotbarSize = inv.hotbarSize;
    ensureSlots(inv.slots.length, inv.hotbarSize);
    if (setText(title, `Inventory - ${inv.gold}g`)) changed = true;

    inv.slots.forEach((slot: ItemSlotState, i) => {
      const s = slots[i];
      if (s === undefined) return;
      const empty = slot.ref === null;
      const inHotbar = i < inv.hotbarSize;
      const selected = inHotbar && i === inv.selected;
      s.inHotbar = inHotbar;
      s.selected = selected;
      s.filled = !empty;

      if (!empty && hasSpriteFrame(slot.frame)) {
        s.iconFrame = slot.frame;
        if (setText(s.glyph, "")) changed = true;
      } else {
        s.iconFrame = "";
        if (setText(s.glyph, empty ? "" : slot.glyph)) changed = true;
      }
      if (setText(s.caption, slot.label)) changed = true;
      if (setText(s.count, slot.text)) changed = true;

      s.root.opacity = empty || (!slot.available && !selected) ? 0.5 : 1;
    });

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  function drawIconsInto(surface: UISurface): void {
    if (!open) return;
    const SELECTED_BORDER = 2;
    for (const s of slots) {
      const { x, y, width, height } = s.root.rect;
      // Slot chrome accents: hotbar belt vs storage, selected gold border (the theme paints the
      // base panel background; these are the DOM version's per-slot border/selected cues).
      if (s.selected) {
        surface.rect(x, y, width, SELECTED_BORDER, EDG.gold);
        surface.rect(x, y + height - SELECTED_BORDER, width, SELECTED_BORDER, EDG.gold);
        surface.rect(x, y, SELECTED_BORDER, height, EDG.gold);
        surface.rect(x + width - SELECTED_BORDER, y, SELECTED_BORDER, height, EDG.gold);
      }
      if (s.iconFrame === "") continue;
      // Hide the source slot's icon while it is being dragged (the ghost carries it).
      const idx = slots.indexOf(s);
      if (dragActive && idx === dragFrom) continue;
      const { x: gx, y: gy, width: gw } = s.glyph.rect;
      const ix = gx + Math.max(0, (gw - ICON_SIZE) / 2);
      let atlasId: string;
      try {
        atlasId = frameToAtlasId(s.iconFrame);
      } catch {
        continue;
      }
      surface.sprite(ix, gy, ICON_SIZE, ICON_SIZE, atlasId, s.iconFrame);
    }
  }

  function drawGhostInto(surface: UISurface): void {
    if (!open || !dragActive || dragFrom === null) return;
    const s = slots[dragFrom];
    if (s === undefined || s.iconFrame === "") return;
    let atlasId: string;
    try {
      atlasId = frameToAtlasId(s.iconFrame);
    } catch {
      return;
    }
    surface.sprite(dragX - ICON_SIZE / 2, dragY - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE, atlasId, s.iconFrame, 0.85);
  }

  /** Is screen point (x,y) inside the modal panel's laid-out rect? */
  function overModal(x: number, y: number): boolean {
    const { x: rx, y: ry, width, height } = modal.rect;
    return x >= rx && x < rx + width && y >= ry && y < ry + height;
  }

  // Window-capture pointer listeners (fire BEFORE the host's canvas-capture listeners). While
  // open, the inventory owns slot presses/drags + backdrop-close and blocks them from the host /
  // world. Idle presses inside the modal (but not on a slot) fall through so a11y/focus still work.
  function onMouseDown(e: MouseEvent): void {
    if (!open || e.button !== 0) return;
    const { x, y } = eventToCssPx(canvas, e);
    // Click outside the modal closes it (mirrors the DOM backdrop-click-to-close).
    if (!overModal(x, y)) {
      setOpen(false);
      e.stopImmediatePropagation();
      return;
    }
    if (!isOwner()) return;
    const idx = slotIndexAt(x, y);
    if (idx === null || !slots[idx]!.filled) return;
    dragFrom = idx;
    dragActive = false;
    pressX = x;
    pressY = y;
    dragX = x;
    dragY = y;
    e.stopImmediatePropagation();
  }

  function onMouseMove(e: MouseEvent): void {
    if (dragFrom === null) return;
    const { x, y } = eventToCssPx(canvas, e);
    dragX = x;
    dragY = y;
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
    e.stopImmediatePropagation();
    if (!wasDragging) return;
    const { x, y } = eventToCssPx(canvas, e);
    const to = slotIndexAt(x, y);
    if (to === null || to === from) return;
    if (isOwner()) swapSlots(from, to);
  }

  window.addEventListener("mousedown", onMouseDown, { capture: true });
  window.addEventListener("mousemove", onMouseMove, { capture: true });
  window.addEventListener("mouseup", onMouseUp, { capture: true });

  function setOpen(v: boolean): void {
    open = v;
    if (!v) {
      dragFrom = null;
      dragActive = false;
    }
  }

  function destroy(): void {
    window.removeEventListener("mousedown", onMouseDown, { capture: true } as EventListenerOptions);
    window.removeEventListener("mousemove", onMouseMove, { capture: true } as EventListenerOptions);
    window.removeEventListener("mouseup", onMouseUp, { capture: true } as EventListenerOptions);
  }

  return {
    getRoot,
    rootHandle,
    refresh,
    isOpen: () => open,
    setOpen,
    toggle: () => setOpen(!open),
    destroy,
  };
}
