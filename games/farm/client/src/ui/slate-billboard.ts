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

// Sidebar category — stacks in the right column with the other collapsible panels.
const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  width: "100%",
  flexShrink: "0",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px",
  boxSizing: "border-box",
  borderTop: `1px solid ${EDG.ink}`,
  pointerEvents: "auto",
};

// Body scrolls on its own so a long slate never pushes the panels below it off-screen.
const BODY_STYLES: Partial<CSSStyleDeclaration> = {
  maxHeight: "40vh",
  overflowY: "auto",
  marginTop: "6px",
};

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

export class SlateBillboardPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private chevronEl: HTMLElement;
  private countEl: HTMLElement;
  private bodyEl: HTMLElement;
  private offersContainer: HTMLElement;
  private emptyEl: HTMLElement;

  /** Maps offerId -> cached row elements */
  private rowCache = new Map<string, OfferRowEls>();

  /** Category body is collapsed by default; click the header to expand. */
  private collapsed = true;
  /** Master visibility (spectator hiding). */
  private masterVisible = true;
  /** Whether the last update carried any offers. */
  private hasOffers = false;

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    this.panel.dataset["slatePanel"] = "";
    applyStyles(this.panel, PANEL_STYLES);

    // --- Header (clickable, collapses the body) ---
    this.headerEl = createEl("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        fontWeight: "bold",
        fontSize: "13px",
        color: EDG.gold,
        borderBottom: `1px solid ${EDG.ink}`,
        paddingBottom: "4px",
      },
    });
    this.headerEl.dataset["slateHeader"] = "";

    const titleGroup = createEl("div", {
      style: { display: "flex", alignItems: "center", gap: "7px" },
    });
    const coin = createEl("span", {
      style: {
        width: "11px",
        height: "11px",
        borderRadius: "50%",
        background: EDG.gold,
        flexShrink: "0",
      },
    });
    const headerTitle = createEl("span", { text: "Shop Slate" });
    this.countEl = createEl("span", {
      style: {
        background: EDG.gold,
        color: EDG.black,
        borderRadius: "8px",
        padding: "0 6px",
        fontSize: "11px",
      },
    });
    titleGroup.appendChild(coin);
    titleGroup.appendChild(headerTitle);
    titleGroup.appendChild(this.countEl);

    this.chevronEl = createEl("span", {
      text: "▸",
      style: { color: EDG.steel, fontSize: "10px" },
    });
    this.headerEl.appendChild(titleGroup);
    this.headerEl.appendChild(this.chevronEl);
    this.headerEl.addEventListener("click", () => this.toggle());

    // --- Body (collapses together) ---
    this.bodyEl = createEl("div", { style: BODY_STYLES });
    this.offersContainer = createEl("div");
    this.emptyEl = createEl("div", {
      text: "No offers right now.",
      style: { color: EDG.steel, fontStyle: "italic" },
    });
    this.bodyEl.appendChild(this.offersContainer);
    this.bodyEl.appendChild(this.emptyEl);

    this.panel.appendChild(this.headerEl);
    this.panel.appendChild(this.bodyEl);

    parent.appendChild(this.panel);

    this.applyCollapse();
    this.render();
  }

  private toggle(): void {
    this.collapsed = !this.collapsed;
    this.applyCollapse();
  }

  private applyCollapse(): void {
    this.bodyEl.style.display = this.collapsed ? "none" : "";
    this.chevronEl.textContent = this.collapsed ? "▸" : "▾";
  }

  /** Show/hide the whole category from masterVisible; the offer count shows in the
   *  header even while collapsed. */
  private render(): void {
    this.panel.style.display = this.masterVisible ? "" : "none";
    this.emptyEl.style.display = this.hasOffers ? "none" : "";
    setText(this.countEl, String(this.rowCache.size));
  }

  update(slate: ReadonlyArray<SlateEntry>, iconFor?: SlateIconResolver): void {
    this.hasOffers = slate.length > 0;

    if (!this.hasOffers) {
      for (const row of this.rowCache.values()) {
        row.root.remove();
      }
      this.rowCache.clear();
      this.render();
      return;
    }

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

    this.render();
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
    this.masterVisible = v;
    this.render();
  }

  destroy(): void {
    this.panel.remove();
    this.rowCache.clear();
  }
}
