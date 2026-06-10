import { createEl, setText, applyStyles } from "./dom";
import type { ShopOffer } from "@farm/sim-core/agents/shop-slate";
import { EDG } from "@engine/core/render";

export type SlateEntry = Pick<ShopOffer, "offerId" | "crop" | "unitPrice" | "quantity" | "remaining">;

interface OfferRowEls {
  root: HTMLElement;
  label: HTMLElement;
}

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  bottom: "0",
  right: "0",
  width: "240px",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px",
  boxSizing: "border-box",
  zIndex: "9998",
  borderTop: `1px solid ${EDG.black}`,
  borderLeft: `1px solid ${EDG.black}`,
};

export class SlateBillboardPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private offersContainer: HTMLElement;

  /** Maps offerId -> cached row elements */
  private rowCache = new Map<string, OfferRowEls>();

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.headerEl = createEl("div", {
      style: {
        fontWeight: "bold",
        fontSize: "13px",
        marginBottom: "6px",
        color: EDG.gold,
        borderBottom: `1px solid ${EDG.ink}`,
        paddingBottom: "4px",
      },
      text: "Shop Slate",
    });

    this.offersContainer = createEl("div");

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.offersContainer);
    parent.appendChild(this.panel);
  }

  update(slate: ReadonlyArray<SlateEntry>): void {
    if (slate.length === 0) {
      // Clear all rows and hide the container
      for (const row of this.rowCache.values()) {
        row.root.remove();
      }
      this.rowCache.clear();
      this.panel.style.display = "none";
      return;
    }

    this.panel.style.display = "";

    // Track which offerIds are present
    const currentIds = new Set(slate.map((o) => o.offerId));

    // Remove stale rows
    for (const [id, row] of this.rowCache) {
      if (!currentIds.has(id)) {
        row.root.remove();
        this.rowCache.delete(id);
      }
    }

    // Upsert rows in slate order
    slate.forEach((offer, index) => {
      let row = this.rowCache.get(offer.offerId);

      if (row === undefined) {
        row = this.buildOfferRow(offer.offerId);
        this.rowCache.set(offer.offerId, row);
        this.offersContainer.appendChild(row.root);
      }

      // Ensure DOM order matches slate order
      const children = Array.from(this.offersContainer.children);
      if (children[index] !== row.root) {
        this.offersContainer.insertBefore(row.root, children[index] ?? null);
      }

      this.updateOfferRow(row, offer);
    });
  }

  private buildOfferRow(offerId: string): OfferRowEls {
    const root = createEl("div", {
      style: {
        borderBottom: `1px solid ${EDG.black}`,
        paddingBottom: "4px",
        marginBottom: "4px",
      },
    });
    root.dataset["offerId"] = offerId;

    const label = createEl("div", { style: { color: EDG.green } });
    root.appendChild(label);

    return { root, label };
  }

  private updateOfferRow(row: OfferRowEls, offer: SlateEntry): void {
    setText(
      row.label,
      `${offer.crop} ${offer.unitPrice}g · ${offer.remaining}/${offer.quantity} left`,
    );
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "" : "none";
  }

  destroy(): void {
    this.panel.remove();
    this.rowCache.clear();
  }
}
