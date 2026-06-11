import { createEl, setText, applyStyles } from "./dom";
import type { ShopOffer } from "@farm/sim-core/agents/shop-slate";
import { EDG } from "@engine/core/render";

export type SlateEntry = Pick<ShopOffer, "offerId" | "crop" | "unitPrice" | "quantity" | "remaining">;

/** Resolves a crop's atlas frame to a pixel-art data URL, or null to skip the icon. */
export type SlateIconResolver = (frame: string) => string | null;

interface OfferRowEls {
  root: HTMLElement;
  icon: HTMLElement;
  name: HTMLElement;
  price: HTMLElement;
  barFill: HTMLElement;
  stock: HTMLElement;
  iconLoaded: boolean;
}

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  bottom: "0",
  right: "0",
  width: "258px",
  maxHeight: "44vh",
  overflowY: "auto",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px 10px 10px",
  boxSizing: "border-box",
  zIndex: "9998",
  borderTop: `1px solid ${EDG.ink}`,
  borderLeft: `1px solid ${EDG.ink}`,
  borderTopLeftRadius: "6px",
};

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

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
        marginBottom: "7px",
        color: EDG.gold,
        borderBottom: `1px solid ${EDG.ink}`,
        paddingBottom: "4px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      },
    });
    const headerTitle = createEl("span", { text: "Shop Slate" });
    const headerHint = createEl("span", {
      text: "buy / sell",
      style: { fontSize: "9px", fontWeight: "normal", color: EDG.steel },
    });
    this.headerEl.appendChild(headerTitle);
    this.headerEl.appendChild(headerHint);

    this.offersContainer = createEl("div");

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.offersContainer);
    parent.appendChild(this.panel);
  }

  update(slate: ReadonlyArray<SlateEntry>, iconFor?: SlateIconResolver): void {
    if (slate.length === 0) {
      for (const row of this.rowCache.values()) {
        row.root.remove();
      }
      this.rowCache.clear();
      this.panel.style.display = "none";
      return;
    }

    this.panel.style.display = "";

    const currentIds = new Set(slate.map((o) => o.offerId));

    for (const [id, row] of this.rowCache) {
      if (!currentIds.has(id)) {
        row.root.remove();
        this.rowCache.delete(id);
      }
    }

    slate.forEach((offer, index) => {
      let row = this.rowCache.get(offer.offerId);

      if (row === undefined) {
        row = this.buildOfferRow(offer.offerId);
        this.rowCache.set(offer.offerId, row);
        this.offersContainer.appendChild(row.root);
      }

      const children = Array.from(this.offersContainer.children);
      if (children[index] !== row.root) {
        this.offersContainer.insertBefore(row.root, children[index] ?? null);
      }

      this.updateOfferRow(row, offer, iconFor);
    });
  }

  private buildOfferRow(offerId: string): OfferRowEls {
    const root = createEl("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 0",
        borderBottom: `1px solid ${EDG.ink}`,
      },
    });
    root.dataset["offerId"] = offerId;

    const icon = createEl("div", {
      style: {
        width: "22px",
        height: "22px",
        flexShrink: "0",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "contain",
        imageRendering: "pixelated",
      },
    });

    // Right side: name + price on top, a stock bar + count below.
    const info = createEl("div", { style: { flex: "1 1 auto", minWidth: "0" } });

    const topLine = createEl("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" },
    });
    const name = createEl("div", { style: { color: EDG.white, fontWeight: "bold" } });
    const price = createEl("div", { style: { color: EDG.gold, fontWeight: "bold", flexShrink: "0" } });
    topLine.appendChild(name);
    topLine.appendChild(price);

    const barTrack = createEl("div", {
      style: {
        height: "5px",
        marginTop: "3px",
        background: EDG.ink,
        borderRadius: "3px",
        overflow: "hidden",
      },
    });
    const barFill = createEl("div", {
      style: { height: "100%", width: "100%", background: EDG.green, borderRadius: "3px" },
    });
    barTrack.appendChild(barFill);

    const stock = createEl("div", {
      style: { fontSize: "10px", color: EDG.steel, marginTop: "2px" },
    });

    info.appendChild(topLine);
    info.appendChild(barTrack);
    info.appendChild(stock);

    root.appendChild(icon);
    root.appendChild(info);

    return { root, icon, name, price, barFill, stock, iconLoaded: false };
  }

  private updateOfferRow(row: OfferRowEls, offer: SlateEntry, iconFor?: SlateIconResolver): void {
    // Crop sprite is fixed per offer — load it once (style write, never via textContent).
    if (!row.iconLoaded && iconFor) {
      const url = iconFor(`crop/${offer.crop}/mature`);
      if (url) {
        row.icon.style.backgroundImage = `url(${url})`;
        row.iconLoaded = true;
      }
    }
    setText(row.name, capitalize(offer.crop));
    setText(row.price, `${offer.unitPrice}g`);
    setText(row.stock, `${offer.remaining}/${offer.quantity} left`);
    const pct = offer.quantity > 0 ? Math.round((offer.remaining / offer.quantity) * 100) : 0;
    // Low stock shifts the bar toward gold then red so scarcity reads at a glance.
    row.barFill.style.width = `${pct}%`;
    row.barFill.style.background = pct <= 20 ? EDG.red : pct <= 50 ? EDG.gold : EDG.green;
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "" : "none";
  }

  destroy(): void {
    this.panel.remove();
    this.rowCache.clear();
  }
}
