/**
 * `time-control-panel.ts` — the director's time-control DOM bar (chunk
 * hollow-11b): pause/resume, a 1x/2x/4x/8x speed selector, and single-step
 * (enabled only while paused). PURE PACING — every callback here maps
 * straight onto `worker/sim-worker.ts`'s `"setPaused"`/`"setSpeed"`/`"step"`
 * messages, which change ONLY how often/how many times the worker calls
 * `sim.tick()`, never what a tick computes (see that file's header).
 *
 * Palette purity: every color is set via inline `style.color`/`background`
 * from a `HOLLOW_PAL.*` role, same idiom as `export-panel.ts`.
 */
import { HOLLOW_PAL } from "./render/hollow-palette";
import { SPEED_OPTIONS, type SpeedMultiplier } from "./time-control";

export interface TimeControlCallbacks {
  onSetPaused(paused: boolean): void;
  onSetSpeed(multiplier: SpeedMultiplier): void;
  onStep(): void;
}

export interface TimeControlPanel {
  readonly el: HTMLElement;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Builds the (unattached) time-control bar. Starts unpaused at 1x, mirroring
 *  the worker's own initial state (see `sim-worker.ts`'s `"init"` handler). */
export function createTimeControlPanel(callbacks: TimeControlCallbacks): TimeControlPanel {
  let paused = false;
  let speed: SpeedMultiplier = 1;

  const root = el("div", "hollow-time-control-panel");
  root.style.background = HOLLOW_PAL.ink;
  root.style.color = HOLLOW_PAL.cream;
  root.style.borderBottom = `2px solid ${HOLLOW_PAL.navy}`;

  const pauseBtn = el("button", "hollow-time-control-button", "Pause") as HTMLButtonElement;
  pauseBtn.type = "button";
  pauseBtn.style.color = HOLLOW_PAL.cream;

  const stepBtn = el("button", "hollow-time-control-button", "Step") as HTMLButtonElement;
  stepBtn.type = "button";
  stepBtn.style.color = HOLLOW_PAL.cream;

  function paintPause(): void {
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.style.background = paused ? HOLLOW_PAL.gold : HOLLOW_PAL.slate;
    stepBtn.style.background = paused ? HOLLOW_PAL.slate : HOLLOW_PAL.navy;
    stepBtn.disabled = !paused;
  }
  paintPause();

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    paintPause();
    callbacks.onSetPaused(paused);
  });
  stepBtn.addEventListener("click", () => {
    if (!paused) return;
    callbacks.onStep();
  });

  const speedGroup = el("div", "hollow-time-control-speed-group");
  const speedButtons = new Map<SpeedMultiplier, HTMLButtonElement>();
  function paintSpeed(): void {
    for (const [opt, btn] of speedButtons) {
      const active = opt === speed;
      btn.style.color = active ? HOLLOW_PAL.ink : HOLLOW_PAL.steel;
      btn.style.background = active ? HOLLOW_PAL.gold : HOLLOW_PAL.navy;
      btn.setAttribute("aria-pressed", String(active));
    }
  }
  for (const opt of SPEED_OPTIONS) {
    const btn = el("button", "hollow-time-control-speed-button", `${opt}x`) as HTMLButtonElement;
    btn.type = "button";
    btn.addEventListener("click", () => {
      speed = opt;
      paintSpeed();
      callbacks.onSetSpeed(speed);
    });
    speedButtons.set(opt, btn);
    speedGroup.appendChild(btn);
  }
  paintSpeed();

  root.appendChild(pauseBtn);
  root.appendChild(stepBtn);
  root.appendChild(speedGroup);

  return { el: root };
}
