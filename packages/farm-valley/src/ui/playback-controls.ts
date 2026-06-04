import { createEl, setText, applyStyles } from "./dom";
import { EDG } from "@engine/core/render";

/**
 * PlaybackControlsPanel — spectator time controls: pause/resume, speed
 * (1x/2x/4x), and single-step. Pure presentation: it fires callbacks that the
 * caller wires to SimClient.setPaused/.setSpeed/.step. It does not touch the
 * sim or its determinism — it only changes wall-clock pacing.
 *
 * Construction follows the leaderboard/slate-billboard pattern: the constructor
 * takes the parent element and appends a fixed panel. State is reflected via
 * `update({ paused, speed })`.
 */

export interface PlaybackState {
  paused: boolean;
  /** Active speed multiplier (1, 2, 4). */
  speed: number;
}

/** Speed multipliers offered, in display order. */
const SPEEDS = [1, 2, 4] as const;

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  bottom: "0",
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "6px 10px",
  boxSizing: "border-box",
  zIndex: "9997",
  borderTop: `1px solid ${EDG.black}`,
  borderLeft: `1px solid ${EDG.black}`,
  borderRight: `1px solid ${EDG.black}`,
  borderTopLeftRadius: "6px",
  borderTopRightRadius: "6px",
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
  private pauseBtn: HTMLButtonElement;
  private stepBtn: HTMLButtonElement;
  private speedBtns: Map<number, HTMLButtonElement> = new Map();

  private onPause: ((paused: boolean) => void) | null = null;
  private onSpeed: ((multiplier: number) => void) | null = null;
  private onStep: (() => void) | null = null;

  // Local mirror of the last state pushed via update(), used so the pause
  // button can toggle without the caller having to track it.
  private state: PlaybackState = { paused: false, speed: 1 };

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

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

  setOnPause(cb: (paused: boolean) => void): void {
    this.onPause = cb;
  }

  setOnSpeed(cb: (multiplier: number) => void): void {
    this.onSpeed = cb;
  }

  setOnStep(cb: () => void): void {
    this.onStep = cb;
  }

  /** Reflect current playback state: pause label, active speed, step enabled. */
  update(state: PlaybackState): void {
    this.state = { ...state };

    setText(this.pauseBtn, state.paused ? "▶ Resume" : "⏸ Pause");

    // Step is only meaningful while paused.
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
    this.speedBtns.clear();
  }
}
