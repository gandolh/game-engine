import { createEl, setText, applyStyles } from "./dom";
import { EDG } from "@engine/core/render";
import type { PlayerHotbar } from "@farm/sim-core/snapshot";

export type IconResolver = (frame: string) => string | null;

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  bottom: "0",
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "flex-end",
  gap: "5px",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "11px",
  padding: "6px 8px",
  boxSizing: "border-box",
  zIndex: "9997",
  borderTopLeftRadius: "6px",
  borderTopRightRadius: "6px",
};

const SLOT_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "1px",
  width: "48px",
  height: "58px",
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

export class HotbarPanel {
  private panel: HTMLElement;
  private slots: SlotEls[] = [];

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);
    parent.appendChild(this.panel);
  }

  private ensureSlots(n: number): void {
    if (this.slots.length === n) return;
    this.panel.replaceChildren();
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const root = createEl("div");
      applyStyles(root, SLOT_STYLES);

      const badge = createEl("div", {
        text: `${i + 1}`,
        style: { fontSize: "8px", color: EDG.slate, alignSelf: "flex-start", lineHeight: "1" },
      });
      const glyph = createEl("div", {
        text: "",
        style: {
          width: "26px",
          height: "26px",
          fontSize: "16px",
          lineHeight: "26px",
          textAlign: "center",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "contain",
          imageRendering: "pixelated",
        },
      });
      const caption = createEl("div", {
        text: "",
        style: { fontSize: "8px", color: EDG.steel, textAlign: "center", lineHeight: "1.1" },
      });
      const count = createEl("div", {
        text: "",
        style: { fontSize: "9px", color: EDG.silver, textAlign: "center", lineHeight: "1.1" },
      });
      root.appendChild(badge);
      root.appendChild(glyph);
      root.appendChild(caption);
      root.appendChild(count);
      this.panel.appendChild(root);
      this.slots.push({ root, glyph, caption, count });
    }
  }

  update(hotbar: PlayerHotbar | null, iconFor?: IconResolver): void {
    if (hotbar === null) {
      this.panel.style.display = "none";
      return;
    }
    this.panel.style.display = "flex";
    this.ensureSlots(hotbar.slots.length);

    hotbar.slots.forEach((slot, i) => {
      const el = this.slots[i]!;
      const selected = i === hotbar.selected;

      const iconUrl = iconFor ? iconFor(slot.frame) : null;
      if (iconUrl) {
        setText(el.glyph, "");
        el.glyph.style.backgroundImage = `url(${iconUrl})`;
      } else {
        el.glyph.style.backgroundImage = "";
        setText(el.glyph, slot.glyph);
      }
      setText(el.caption, slot.label);
      setText(el.count, slot.text);
      applyStyles(el.root, {
        borderColor: selected ? EDG.gold : EDG.navy,
        background: selected ? EDG.navy : EDG.ink,

        opacity: !slot.available && !selected ? "0.45" : "1",
      });
    });
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "flex" : "none";
  }

  destroy(): void {
    this.panel.remove();
    this.slots = [];
  }
}
