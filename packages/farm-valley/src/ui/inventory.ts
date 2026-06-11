import { createEl, setText, applyStyles } from "./dom";
import { EDG } from "@engine/core/render";
import type { PlayerInventory } from "@farm/sim-core/snapshot";
import type { IconResolver } from "./hotbar";

/**
 * InventoryPanel — Pip's full unified item grid, opened with **E**. The first row mirrors the
 * bottom hotbar; the rows below are the backpack. Every item the player holds (tools, seeds,
 * harvested crops, fish, resources, livestock products, fruit, golden beans) shows here with a
 * live count from the snapshot.
 *
 * Drag a non-empty slot onto any other slot to swap them (HTML5 drag-and-drop). Dropping a
 * hotbar slot into the backpack (and vice-versa) is just a swap — that's how items move between
 * the hotbar and the inventory. The swap is sent to the sim via `onSwap`; layout is owned by the
 * sim, so the panel re-renders from the next snapshot (optimistic local state is unnecessary).
 */

const OVERLAY_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  inset: "0",
  display: "none",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(24, 20, 37, 0.55)", // EDG.black, translucent
  zIndex: "9998",
};

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "14px 16px",
  border: `2px solid ${EDG.navy}`,
  borderRadius: "8px",
  boxSizing: "border-box",
};

const SLOT_STYLES: Partial<CSSStyleDeclaration> = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "1px",
  width: "52px",
  height: "60px",
  padding: "3px 2px",
  background: EDG.ink,
  border: `2px solid ${EDG.navy}`,
  borderRadius: "4px",
  boxSizing: "border-box",
};

interface SlotEls {
  root: HTMLElement;
  glyph: HTMLElement;
  caption: HTMLElement;
  count: HTMLElement;
}

export class InventoryPanel {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private title: HTMLElement;
  private grid: HTMLElement;
  private hint: HTMLElement;
  private slots: SlotEls[] = [];
  private open = false;
  /** Index a drag started from, for the drop handler. */
  private dragFrom: number | null = null;

  /** Called with (from, to) when the user drops one slot onto another. */
  onSwap: ((from: number, to: number) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.overlay = createEl("div");
    applyStyles(this.overlay, OVERLAY_STYLES);
    // Click on the dimmed backdrop (outside the panel) closes the inventory.
    this.overlay.addEventListener("mousedown", (e) => {
      if (e.target === this.overlay) this.setOpen(false);
    });

    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.title = createEl("div", {
      text: "Inventory",
      style: { fontSize: "14px", color: EDG.gold, fontWeight: "bold" },
    });
    this.grid = createEl("div", {
      style: { display: "grid", gap: "5px", justifyContent: "center" },
    });
    this.hint = createEl("div", {
      text: "Drag items to rearrange · top row is the hotbar · E or Esc to close",
      style: { fontSize: "10px", color: EDG.slate, textAlign: "center" },
    });

    this.panel.appendChild(this.title);
    this.panel.appendChild(this.grid);
    this.panel.appendChild(this.hint);
    this.overlay.appendChild(this.panel);
    parent.appendChild(this.overlay);
  }

  private ensureSlots(n: number, columns: number): void {
    this.grid.style.gridTemplateColumns = `repeat(${columns}, 52px)`;
    if (this.slots.length === n) return;
    this.grid.replaceChildren();
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const root = createEl("div");
      applyStyles(root, SLOT_STYLES);
      root.draggable = true;

      const glyph = createEl("div", {
        style: {
          width: "30px",
          height: "30px",
          fontSize: "18px",
          lineHeight: "30px",
          textAlign: "center",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "contain",
          imageRendering: "pixelated",
          pointerEvents: "none",
        },
      });
      const caption = createEl("div", {
        style: { fontSize: "8px", color: EDG.steel, textAlign: "center", lineHeight: "1.1", pointerEvents: "none" },
      });
      const count = createEl("div", {
        style: { fontSize: "9px", color: EDG.silver, textAlign: "center", lineHeight: "1.1", pointerEvents: "none" },
      });
      root.appendChild(glyph);
      root.appendChild(caption);
      root.appendChild(count);

      const index = i;
      root.addEventListener("dragstart", (e) => {
        this.dragFrom = index;
        e.dataTransfer?.setData("text/plain", String(index));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      root.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        root.style.borderColor = EDG.cyan;
      });
      root.addEventListener("dragleave", () => {
        root.style.borderColor = EDG.navy;
      });
      root.addEventListener("drop", (e) => {
        e.preventDefault();
        root.style.borderColor = EDG.navy;
        const raw = e.dataTransfer?.getData("text/plain");
        const from = raw !== undefined && raw !== "" ? Number(raw) : this.dragFrom;
        this.dragFrom = null;
        if (from === null || Number.isNaN(from) || from === index) return;
        this.onSwap?.(from, index);
      });

      this.grid.appendChild(root);
      this.slots.push({ root, glyph, caption, count });
    }
  }

  update(inv: PlayerInventory | null, iconFor?: IconResolver): void {
    if (!this.open || inv === null) return;
    this.ensureSlots(inv.slots.length, inv.hotbarSize);
    setText(this.title, `Inventory — ${inv.gold}g`);

    inv.slots.forEach((slot, i) => {
      const el = this.slots[i]!;
      const empty = slot.ref === null;
      const inHotbar = i < inv.hotbarSize;
      const selected = inHotbar && i === inv.selected;

      el.root.draggable = !empty;

      const iconUrl = !empty && slot.frame && iconFor ? iconFor(slot.frame) : null;
      if (iconUrl) {
        setText(el.glyph, "");
        el.glyph.style.backgroundImage = `url(${iconUrl})`;
      } else {
        el.glyph.style.backgroundImage = "";
        setText(el.glyph, empty ? "" : slot.glyph);
      }
      setText(el.caption, slot.label);
      setText(el.count, slot.text);

      applyStyles(el.root, {
        // The hotbar row reads slightly warmer so it's distinct from the backpack.
        background: selected ? EDG.navy : inHotbar ? EDG.ink : EDG.black,
        borderColor: selected ? EDG.gold : inHotbar ? EDG.steel : EDG.navy,
        opacity: empty || (!slot.available && !selected) ? "0.5" : "1",
      });
    });
  }

  isOpen(): boolean {
    return this.open;
  }

  setOpen(v: boolean): void {
    this.open = v;
    this.overlay.style.display = v ? "flex" : "none";
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  destroy(): void {
    this.overlay.remove();
    this.slots = [];
  }
}
