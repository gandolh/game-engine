import { createEl, applyStyles } from "./dom";

export interface HomeScreenOptions {
  title?: string;
  subtitle?: string;
  startLabel?: string;
}

const OVERLAY_STYLES: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  inset: "0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "24px",
  background:
    "radial-gradient(ellipse at center, #1a2230 0%, #0c0d12 70%)",
  color: "#f5e9c8",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  zIndex: "1000",
  transition: "opacity 200ms ease-out",
};

const TITLE_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "72px",
  fontWeight: "700",
  letterSpacing: "0.08em",
  margin: "0",
  color: "#f5e9c8",
  textShadow: "0 0 24px rgba(201, 168, 90, 0.45)",
};

const SUBTITLE_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "16px",
  margin: "0",
  color: "#9ba6b8",
  maxWidth: "520px",
  textAlign: "center",
  lineHeight: "1.5",
};

const BUTTON_STYLES: Partial<CSSStyleDeclaration> = {
  marginTop: "12px",
  padding: "12px 36px",
  fontSize: "18px",
  fontFamily: "inherit",
  fontWeight: "600",
  letterSpacing: "0.05em",
  color: "#0c0d12",
  background: "#c9a85a",
  border: "2px solid #c9a85a",
  borderRadius: "6px",
  cursor: "pointer",
  boxShadow: "0 0 24px rgba(201, 168, 90, 0.35)",
  transition: "transform 120ms ease-out, background 120ms ease-out",
};

const HINT_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "12px",
  color: "#6a7384",
  margin: "0",
  letterSpacing: "0.04em",
};

export class HomeScreen {
  private overlay: HTMLElement;
  private button: HTMLButtonElement;
  private onStart: (() => void) | null = null;
  private started = false;

  constructor(parent: HTMLElement, opts: HomeScreenOptions = {}) {
    this.overlay = createEl("div");
    applyStyles(this.overlay, OVERLAY_STYLES);

    const title = createEl("h1", { text: opts.title ?? "Farm Valley" });
    applyStyles(title, TITLE_STYLES);

    const subtitle = createEl("p", {
      text:
        opts.subtitle ??
        "Watch four BDI farmers plant, trade, and outwit each other across 100 days.",
    });
    applyStyles(subtitle, SUBTITLE_STYLES);

    this.button = createEl("button", { text: opts.startLabel ?? "Start" });
    applyStyles(this.button, BUTTON_STYLES);
    this.button.type = "button";
    this.button.addEventListener("mouseenter", () => {
      this.button.style.transform = "translateY(-1px)";
      this.button.style.background = "#dbbd6e";
    });
    this.button.addEventListener("mouseleave", () => {
      this.button.style.transform = "";
      this.button.style.background = "#c9a85a";
    });
    this.button.addEventListener("click", () => this.trigger());

    const hint = createEl("p", { text: "Press Enter or click Start" });
    applyStyles(hint, HINT_STYLES);

    this.overlay.appendChild(title);
    this.overlay.appendChild(subtitle);
    this.overlay.appendChild(this.button);
    this.overlay.appendChild(hint);
    parent.appendChild(this.overlay);

    this.keyHandler = this.keyHandler.bind(this);
    window.addEventListener("keydown", this.keyHandler);
    this.button.focus();
  }

  onStartClicked(cb: () => void): void {
    this.onStart = cb;
  }

  private trigger(): void {
    if (this.started) return;
    this.started = true;
    this.dismiss();
    this.onStart?.();
  }

  private keyHandler(ev: KeyboardEvent): void {
    if (this.started) return;
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this.trigger();
    }
  }

  private dismiss(): void {
    window.removeEventListener("keydown", this.keyHandler);
    this.overlay.style.opacity = "0";
    this.overlay.style.pointerEvents = "none";
    window.setTimeout(() => this.overlay.remove(), 220);
  }
}
