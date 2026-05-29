import { createEl, applyStyles } from "../ui/dom";

export interface HomeScreenOptions {
  title?: string;
  subtitle?: string;
  startLabel?: string;
  defaultSeed?: number;
}

/** Default run seed when the field is empty or invalid. */
export const DEFAULT_SEED = 0xc0ffee;

/**
 * Parse a seed from user input. Accepts hex (`0x...`) or decimal.
 * Empty / NaN / non-finite / negative input falls back to {@link DEFAULT_SEED}.
 */
export function parseSeed(raw: string, fallback = DEFAULT_SEED): number {
  const s = raw.trim();
  if (s === "") return fallback;
  const n = /^0x[0-9a-fA-F]+$/.test(s) ? Number.parseInt(s, 16) : Number(s);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** Render a seed as a `0x`-prefixed hex string for display in the field. */
export function formatSeed(seed: number): string {
  return `0x${(seed >>> 0).toString(16)}`;
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

const SEED_ROW_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const SEED_LABEL_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "13px",
  color: "#9ba6b8",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const SEED_INPUT_STYLES: Partial<CSSStyleDeclaration> = {
  padding: "8px 12px",
  fontSize: "16px",
  fontFamily: "ui-monospace, monospace",
  color: "#f5e9c8",
  background: "rgba(12, 13, 18, 0.8)",
  border: "1px solid #c9a85a",
  borderRadius: "6px",
  width: "160px",
  textAlign: "center",
};

const RANDOMIZE_STYLES: Partial<CSSStyleDeclaration> = {
  padding: "8px 16px",
  fontSize: "13px",
  fontFamily: "inherit",
  fontWeight: "600",
  letterSpacing: "0.05em",
  color: "#c9a85a",
  background: "transparent",
  border: "1px solid #c9a85a",
  borderRadius: "6px",
  cursor: "pointer",
  transition: "background 120ms ease-out, color 120ms ease-out",
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
  private seedInput: HTMLInputElement;
  private defaultSeed: number;
  private onStart: ((seed: number) => void) | null = null;
  private started = false;

  constructor(parent: HTMLElement, opts: HomeScreenOptions = {}) {
    this.defaultSeed = opts.defaultSeed ?? DEFAULT_SEED;

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

    // Seed picker row: label + input + Randomize button.
    const seedRow = createEl("div");
    applyStyles(seedRow, SEED_ROW_STYLES);

    const seedLabel = createEl("label", { text: "Seed" });
    applyStyles(seedLabel, SEED_LABEL_STYLES);

    this.seedInput = createEl("input");
    applyStyles(this.seedInput, SEED_INPUT_STYLES);
    this.seedInput.type = "text";
    this.seedInput.value = formatSeed(this.defaultSeed);
    this.seedInput.spellcheck = false;
    this.seedInput.setAttribute("aria-label", "Run seed");
    // Enter inside the field starts the game.
    this.seedInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.trigger();
      }
    });

    const randomizeBtn = createEl("button", { text: "Randomize" });
    applyStyles(randomizeBtn, RANDOMIZE_STYLES);
    randomizeBtn.type = "button";
    randomizeBtn.addEventListener("mouseenter", () => {
      randomizeBtn.style.background = "#c9a85a";
      randomizeBtn.style.color = "#0c0d12";
    });
    randomizeBtn.addEventListener("mouseleave", () => {
      randomizeBtn.style.background = "transparent";
      randomizeBtn.style.color = "#c9a85a";
    });
    randomizeBtn.addEventListener("click", () => {
      // Math.random() is allowed HERE only (pre-sim UI), per brief 18.
      const fresh = Math.floor(Math.random() * 0x100000000) >>> 0;
      this.seedInput.value = formatSeed(fresh);
    });

    seedRow.appendChild(seedLabel);
    seedRow.appendChild(this.seedInput);
    seedRow.appendChild(randomizeBtn);

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
    this.overlay.appendChild(seedRow);
    this.overlay.appendChild(this.button);
    this.overlay.appendChild(hint);
    parent.appendChild(this.overlay);

    this.keyHandler = this.keyHandler.bind(this);
    window.addEventListener("keydown", this.keyHandler);
    this.button.focus();
  }

  onStartClicked(cb: (seed: number) => void): void {
    this.onStart = cb;
  }

  private trigger(): void {
    if (this.started) return;
    this.started = true;
    const seed = parseSeed(this.seedInput.value, this.defaultSeed);
    this.dismiss();
    this.onStart?.(seed);
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
