import { createEl, applyStyles } from "../ui/dom";
import { EDG } from "@engine/core/render";
import { formatSeed } from "./home-screen";

/** Inject the dot-pulse keyframes once into the document head. */
function ensurePulseKeyframes(): void {
  const STYLE_ID = "__loading-screen-pulse__";
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@keyframes ls-dot-pulse {
  0%, 80%, 100% { opacity: 0.2; }
  40% { opacity: 1; }
}
`;
  document.head.appendChild(style);
}

const OVERLAY_STYLES: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  inset: "0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "20px",
  background: `radial-gradient(ellipse at center, ${EDG.black} 0%, ${EDG.black} 70%)`,
  color: EDG.cream,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  zIndex: "1000",
  transition: "opacity 200ms ease-out",
};

const TITLE_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "28px",
  fontWeight: "700",
  letterSpacing: "0.1em",
  margin: "0",
  color: EDG.cream,
};

const SEED_LINE_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "13px",
  color: EDG.steel,
  margin: "0",
  letterSpacing: "0.06em",
  fontFamily: "ui-monospace, monospace",
};

const PROGRESS_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "14px",
  color: EDG.tan,
  margin: "0",
  letterSpacing: "0.05em",
  minHeight: "1.4em",
};

const DOT_ROW_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  justifyContent: "center",
};

const DOT_STYLES: Partial<CSSStyleDeclaration> = {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: EDG.tan,
  opacity: "0.2",
};

export interface LoadingScreenOptions {
  seed?: number;
}

export class LoadingScreen {
  private overlay: HTMLElement;
  private progressEl: HTMLElement;
  private hiding = false;

  constructor(parent: HTMLElement, opts: LoadingScreenOptions = {}) {
    ensurePulseKeyframes();

    this.overlay = createEl("div");
    applyStyles(this.overlay, OVERLAY_STYLES);

    const title = createEl("p", { text: "Loading…" });
    applyStyles(title, TITLE_STYLES);
    this.overlay.appendChild(title);

    if (opts.seed !== undefined) {
      const seedLine = createEl("p", { text: `Seed ${formatSeed(opts.seed)}` });
      applyStyles(seedLine, SEED_LINE_STYLES);
      this.overlay.appendChild(seedLine);
    }

    this.progressEl = createEl("p", { text: "" });
    applyStyles(this.progressEl, PROGRESS_STYLES);
    this.overlay.appendChild(this.progressEl);

    const dotRow = createEl("div");
    applyStyles(dotRow, DOT_ROW_STYLES);
    for (let i = 0; i < 3; i++) {
      const dot = createEl("div");
      applyStyles(dot, DOT_STYLES);
      dot.style.animation = `ls-dot-pulse 1.4s ease-in-out ${i * 0.32}s infinite both`;
      dotRow.appendChild(dot);
    }
    this.overlay.appendChild(dotRow);

    parent.appendChild(this.overlay);
  }

  show(): void {
    this.hiding = false;
    this.overlay.style.opacity = "1";
    this.overlay.style.pointerEvents = "auto";
  }

  setProgress(label: string): void {
    this.progressEl.textContent = label;
  }

  hide(): void {
    if (this.hiding) return;
    this.hiding = true;
    this.overlay.style.opacity = "0";
    this.overlay.style.pointerEvents = "none";
    window.setTimeout(() => this.overlay.remove(), 220);
  }
}
