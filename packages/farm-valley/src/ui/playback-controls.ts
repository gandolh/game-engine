import { createEl, setText, applyStyles } from "./dom";
import { EDG } from "@engine/core/render";
import { personalityColor } from "./colors";
import type { FarmerFsmState } from "@farm/sim-core/components/farmer";

/** Keybindings shown in the help modal — [keys, what they do]. */
const KEY_BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ["W A S D · ↑ ↓ ← →", "Walk Pip one tile"],
  ["E", "Use the selected hotbar tool on the tile you face"],
  ["Space", "Recenter the camera on yourself"],
  ["1 – 8", "Select a hotbar slot"],
  ["P", "Pause / resume"],
  [".", "Step one tick (while paused)"],
  ["H", "Skip to next highlight (next high-drama event)"],
  ["Drag", "Pan the camera"],
  ["Scroll", "Zoom in / out"],
];

/** What each hotbar slot does — [glyph, name, effect]. Keep in sync with HOTBAR_SLOTS. */
const TOOL_HELP: ReadonlyArray<readonly [string, string, string]> = [
  ["🪣", "Can", "Water a planted, un-watered plot"],
  ["⛏", "Hoe", "Till bare ground into soil"],
  ["🪓", "Axe", "Chop a tree for wood"],
  ["⚒", "Pickaxe", "Mine a stone for ore"],
  ["🎣", "Rod", "Fish — stand on a fishing isle and cast into adjacent water"],
  ["🌱", "Radish", "Plant radish seeds on your tilled plot"],
  ["🌾", "Wheat", "Plant wheat seeds on your tilled plot"],
  ["🎃", "Pumpkin", "Plant pumpkin seeds on your tilled plot"],
];

/** Personality glosses grounded in deliberate* logic; swatch via personalityColor() stays on-palette. */
const PERSONALITY_HELP: ReadonlyArray<readonly [string, string]> = [
  [
    "conservative",
    "Plays it safe: waters every plot early, expands slowly, plants the cheapest in-season crop, and leans hardest into patient capital (orchard, livestock, greenhouse).",
  ],
  [
    "aggressive",
    "Chases profit: over-plants and waters lazily, expands fast, plants the priciest in-season crop, undercuts the market wall, and takes the riskiest harbor contracts.",
  ],
  [
    "hoarder",
    "Accumulates: waters religiously, buys up cheap radish offers ranked by trust, wins and keeps the golden bean, and stockpiles toward livestock and a greenhouse.",
  ],
  [
    "opportunist",
    "Reads the market: plants by weather and season, posts at fair price or dumps by supply, buys the best-trust wall offer, and fishes the coral reef readily.",
  ],
];

const FSM_HELP: ReadonlyArray<readonly [FarmerFsmState, string]> = [
  ["WAIT_DAY", "Waiting at the start of the day for work to begin"],
  ["PERCEIVE", "Sensing the world — crops, prices, weather, neighbours"],
  ["DELIBERATE", "Choosing what to do next (its personality picks intentions)"],
  ["ACT", "Carrying out the chosen task"],
  ["FINISH_DAY", "Wrapping up the day's work"],
  ["SLEEP", "Resting at home for the night"],
];

export interface PlaybackState {
  paused: boolean;
  /** Active speed multiplier (1, 2, 4). */
  speed: number;
}

/** Speed multipliers offered, in display order. */
const SPEEDS = [1, 2, 4] as const;

// Flex child of right-column; re-enables pointer-events (column sets none for canvas passthrough).
const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px 10px",
  boxSizing: "border-box",
  pointerEvents: "auto",
  borderBottom: `1px solid ${EDG.ink}`,
};

const BTN_STYLES: Partial<CSSStyleDeclaration> = {
  font: "12px/1 monospace",
  color: EDG.silver,
  background: EDG.black,
  border: `1px solid ${EDG.ink}`,
  borderRadius: "4px",
  padding: "5px 9px",
  cursor: "pointer",
  minWidth: "34px",
  textAlign: "center",
};

export class PlaybackControlsPanel {
  private panel: HTMLElement;
  private helpBtn: HTMLButtonElement;
  private helpModal: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private stepBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private speedBtns: Map<number, HTMLButtonElement> = new Map();

  private onPause: ((paused: boolean) => void) | null = null;
  private onSpeed: ((multiplier: number) => void) | null = null;
  private onStep: (() => void) | null = null;
  private onSkipToHighlight: (() => void) | null = null;

  // Local mirror of the last state pushed via update(), used so the pause
  // button can toggle without the caller having to track it.
  private state: PlaybackState = { paused: false, speed: 1 };

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    this.helpModal = this.buildHelpModal(parent);
    this.helpBtn = createEl("button", { text: "?" });
    applyStyles(this.helpBtn, BTN_STYLES);
    this.helpBtn.type = "button";
    this.helpBtn.title = "Controls & tools";
    this.helpBtn.addEventListener("click", () => {
      this.setHelpVisible(this.helpModal.style.display === "none");
    });
    this.panel.appendChild(this.helpBtn);

    this.pauseBtn = createEl("button", { text: "⏸ Pause" });
    applyStyles(this.pauseBtn, BTN_STYLES);
    this.pauseBtn.type = "button";
    this.pauseBtn.addEventListener("click", () => {
      this.onPause?.(!this.state.paused);
    });
    this.panel.appendChild(this.pauseBtn);

    this.stepBtn = createEl("button", { text: "⏭ Step" });
    applyStyles(this.stepBtn, BTN_STYLES);
    this.stepBtn.type = "button";
    this.stepBtn.addEventListener("click", () => {
      this.onStep?.();
    });
    this.panel.appendChild(this.stepBtn);

    this.skipBtn = createEl("button", { text: "★ Skip [H]" });
    applyStyles(this.skipBtn, BTN_STYLES);
    this.skipBtn.type = "button";
    this.skipBtn.title = "Fast-forward to the next dramatic event (H)";
    this.skipBtn.addEventListener("click", () => {
      this.onSkipToHighlight?.();
    });
    this.panel.appendChild(this.skipBtn);

    const sep = createEl("span", {
      text: "│",
      style: { color: EDG.ink, padding: "0 2px" },
    });
    this.panel.appendChild(sep);

    for (const mult of SPEEDS) {
      const btn = createEl("button", { text: `${mult}×` });
      applyStyles(btn, BTN_STYLES);
      btn.type = "button";
      btn.addEventListener("click", () => {
        this.onSpeed?.(mult);
      });
      this.speedBtns.set(mult, btn);
      this.panel.appendChild(btn);
    }

    parent.appendChild(this.panel);
    this.update(this.state);
  }

  private buildHelpModal(parent: HTMLElement): HTMLElement {
    const backdrop = createEl("div", {
      style: {
        position: "fixed",
        inset: "0",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(24, 20, 37, 0.6)", // EDG.black, translucent
        pointerEvents: "auto",
        zIndex: "10000",
      },
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) this.setHelpVisible(false);
    });

    const card = createEl("div", {
      style: {
        minWidth: "360px",
        maxWidth: "440px",
        maxHeight: "80vh",
        overflowY: "auto",
        padding: "18px 22px",
        font: "12px/1.5 monospace",
        color: EDG.cream,
        background: EDG.black,
        border: `2px solid ${EDG.tan}`,
        borderRadius: "8px",
        boxShadow: "0 0 40px rgba(24, 20, 37, 0.6)",
      },
    });
    card.addEventListener("click", (e) => e.stopPropagation());

    const header = createEl("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "10px",
      },
    });
    header.appendChild(
      createEl("span", {
        text: "How to play",
        style: { color: EDG.gold, fontWeight: "700", fontSize: "14px" },
      }),
    );
    const closeBtn = createEl("button", { text: "×" });
    applyStyles(closeBtn, BTN_STYLES);
    closeBtn.type = "button";
    closeBtn.addEventListener("click", () => this.setHelpVisible(false));
    header.appendChild(closeBtn);
    card.appendChild(header);

    card.appendChild(this.sectionTitle("Controls"));
    for (const [keys, desc] of KEY_BINDINGS) {
      card.appendChild(
        this.helpRow(
          createEl("span", {
            text: keys,
            style: { color: EDG.gold, whiteSpace: "nowrap" },
          }),
          desc,
        ),
      );
    }

    card.appendChild(this.sectionTitle("Tools (select with 1–8, use with E)"));
    for (const [glyph, name, effect] of TOOL_HELP) {
      const label = createEl("span", { style: { whiteSpace: "nowrap" } });
      label.appendChild(createEl("span", { text: `${glyph} ` }));
      label.appendChild(
        createEl("span", { text: name, style: { color: EDG.gold } }),
      );
      card.appendChild(this.helpRow(label, effect));
    }

    card.appendChild(this.sectionTitle("Personalities"));
    for (const [kind, gloss] of PERSONALITY_HELP) {
      const label = createEl("span", {
        style: { display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" },
      });
      const swatch = createEl("span", {
        style: {
          flex: "0 0 auto",
          width: "10px",
          height: "10px",
          borderRadius: "2px",
          background: personalityColor(kind),
        },
      });
      label.appendChild(swatch);
      label.appendChild(createEl("span", { text: kind, style: { color: EDG.gold } }));
      card.appendChild(this.helpRow(label, gloss));
    }

    card.appendChild(this.sectionTitle("Farmer states (FSM)"));
    for (const [state, gloss] of FSM_HELP) {
      card.appendChild(
        this.helpRow(
          createEl("span", {
            text: state,
            style: { color: EDG.gold, whiteSpace: "nowrap" },
          }),
          gloss,
        ),
      );
    }

    backdrop.appendChild(card);
    parent.appendChild(backdrop);
    return backdrop;
  }

  private sectionTitle(text: string): HTMLElement {
    return createEl("div", {
      text,
      style: {
        color: EDG.silver,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontSize: "10px",
        margin: "12px 0 4px",
        borderBottom: `1px solid ${EDG.ink}`,
        paddingBottom: "2px",
      },
    });
  }

  private helpRow(left: HTMLElement, desc: string): HTMLElement {
    const row = createEl("div", {
      style: { display: "flex", gap: "12px", padding: "2px 0" },
    });
    const leftCell = createEl("div", {
      style: { flex: "0 0 130px" },
    });
    leftCell.appendChild(left);
    row.appendChild(leftCell);
    row.appendChild(
      createEl("div", { text: desc, style: { flex: "1", color: EDG.cream } }),
    );
    return row;
  }

  setHelpVisible(v: boolean): void {
    this.helpModal.style.display = v ? "flex" : "none";
  }

  setOnPause(cb: (paused: boolean) => void): void {
    this.onPause = cb;
  }

  setOnSpeed(cb: (multiplier: number) => void): void {
    this.onSpeed = cb;
  }

  setOnStep(cb: () => void): void {
    this.onStep = cb;
  }

  setOnSkipToHighlight(cb: () => void): void {
    this.onSkipToHighlight = cb;
  }

  update(state: PlaybackState): void {
    this.state = { ...state };

    setText(this.pauseBtn, state.paused ? "▶ Resume" : "⏸ Pause");

    this.stepBtn.disabled = !state.paused;
    applyStyles(this.stepBtn, {
      opacity: state.paused ? "1" : "0.4",
      cursor: state.paused ? "pointer" : "default",
    });

    for (const [mult, btn] of this.speedBtns) {
      const active = mult === state.speed;
      applyStyles(btn, {
        background: active ? EDG.tan : EDG.black,
        color: active ? EDG.black : EDG.silver,
        borderColor: active ? EDG.tan : EDG.ink,
        fontWeight: active ? "700" : "400",
      });
    }
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "flex" : "none";
  }

  destroy(): void {
    this.panel.remove();
    this.helpModal.remove();
    this.speedBtns.clear();
    this.onSkipToHighlight = null;
  }
}
