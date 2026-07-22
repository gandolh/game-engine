/**
 * MateQuest — browser entry point (M1: the turn-combat loop).
 *
 * Boots the sim worker (`src/worker/sim-worker.ts`) and renders the combat screen
 * (`src/ui/combat-screen.ts`) every frame from the latest `CombatSnapshot`, over a plain
 * Canvas2D renderer (explicitly `"canvas2d"` — no WebGPU adapter probing in this environment).
 *
 * Wiring (mirrors Citadel's `main/hud-panels.ts` + `main/input.ts`, stripped to ONE UI root
 * since MateQuest M1 has no world layer underneath the UI):
 *   - a single `InputDispatcher` hit-tests the combat screen's tree; canvas pointer events are
 *     forwarded to it in CSS-logical px (clientX − rect.left; NOT device px).
 *   - a hidden a11y mirror reflects the tree into DOM and bridges focus both ways.
 *   - physical-keyboard entry (digits / Backspace / Enter) edits the SAME typed-answer buffer the
 *     on-screen keypad does, so both input paths drive `submit-answer`.
 *
 * Sim/render boundary (root CLAUDE.md): this file only ever READS `CombatSnapshot`s off the
 * worker and POSTS commands to it — it never mutates sim state directly. All combat logic +
 * randomness live in `@mathquest/sim-core`, behind the worker.
 */
import "./style.css";
import { Camera2D, createRenderer, type RendererLike } from "@engine/core";
import {
  UISurface,
  loadFontAtlas,
  computeLayout,
  renderTree,
  createInputDispatcher,
  createA11yMirror,
  type InputDispatcher,
  type A11yMirror,
} from "@engine/ui";
import type { CombatSnapshot } from "@mathquest/sim-core";
import { MATE_PAL } from "./render/mate-palette";
import { MATE_THEME } from "./render/mate-theme";
import { createCombatScreen, type CombatScreenActions } from "./ui/combat-screen";
import type { WorkerInbound, WorkerOutbound } from "./worker/sim-worker";

// M1 has no run/seed-select screen yet — a fixed seed proves the deterministic-seed seam and
// gives a repeatable fight; Restart re-inits with the same seed.
const SEED = 1;
// The math answers in M1 are a+b with a,b ∈ 2..9 (max 18), so two digits suffice; cap at 3 to
// keep the typed buffer from growing without bound if the player mashes the keypad.
const MAX_ANSWER_DIGITS = 3;

const canvasRaw = document.getElementById("scene");
if (!(canvasRaw instanceof HTMLCanvasElement)) {
  throw new Error("mathquest: #scene canvas missing from index.html");
}
const canvas: HTMLCanvasElement = canvasRaw;
const a11yMount = document.getElementById("ui-a11y-mirror");

// Palette-sourced page chrome (CSS can't import MATE_PAL — keeps every colour on the palette
// contract, root CLAUDE.md).
document.body.style.background = MATE_PAL.black;
document.body.style.color = MATE_PAL.cream;

async function main(): Promise<void> {
  const camera = new Camera2D({ worldUnitsX: 960, worldUnitsY: 540, centerX: 480, centerY: 270 });
  const renderer: RendererLike = await createRenderer(canvas, camera, { backend: "canvas2d" });
  renderer.clearColor = MATE_PAL.black;
  renderer.addAtlas(await loadFontAtlas());
  const surface = new UISurface(renderer);

  // --- Worker ---------------------------------------------------------------------------------
  const worker = new Worker(new URL("./worker/sim-worker", import.meta.url), { type: "module" });
  const post = (msg: WorkerInbound): void => worker.postMessage(msg);

  let latest: CombatSnapshot | null = null;
  worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
    const msg = event.data;
    if (msg.type === "snapshot") latest = msg.snapshot;
  });

  // --- Typed-answer buffer (host-side; the sim never sees a partial answer) --------------------
  let typedValue = "";

  const actions: CombatScreenActions = {
    chooseAction(action) {
      typedValue = ""; // fresh problem → fresh buffer
      post({ type: "choose-action", action });
    },
    appendDigit(digit) {
      if (typedValue.length >= MAX_ANSWER_DIGITS) return;
      // Avoid a leading zero producing "007"; a bare "0" is still allowed as a first keypress.
      if (typedValue === "0") typedValue = String(digit);
      else typedValue += String(digit);
    },
    backspace() {
      typedValue = typedValue.slice(0, -1);
    },
    submit() {
      if (typedValue.length === 0) return;
      post({ type: "submit-answer", value: Number(typedValue) });
      typedValue = "";
    },
    restart() {
      typedValue = "";
      post({ type: "init", seed: SEED });
    },
  };

  const screen = createCombatScreen(actions);

  // --- Input: one dispatcher over the single combat-screen root + a focus-bridged a11y mirror --
  const dispatcher: InputDispatcher = createInputDispatcher(() => screen.root);
  let mirror: A11yMirror | undefined;
  if (a11yMount !== null) {
    mirror = createA11yMirror(a11yMount, {
      rootLabel: "MateQuest combat",
      onFocusNode: (id) => (id === null ? dispatcher.blur() : dispatcher.focus(id)),
    });
  }
  const syncFocus = (): void => mirror?.setFocus(dispatcher.focused()?.id ?? null);

  const cssPx = (e: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  canvas.addEventListener("mousedown", (e) => {
    const { x, y } = cssPx(e);
    dispatcher.pointerDown(x, y);
    syncFocus();
  });
  canvas.addEventListener("mouseup", (e) => {
    const { x, y } = cssPx(e);
    dispatcher.pointerUp(x, y);
  });
  canvas.addEventListener("mousemove", (e) => {
    const { x, y } = cssPx(e);
    dispatcher.pointerMove(x, y);
  });

  // Keyboard: let the dispatcher have first refusal (Tab traversal, Enter/Space on a focused
  // button). If it didn't consume the key, treat digits/Backspace/Enter as answer entry — so the
  // problem can be solved from the physical keyboard, not just the on-screen keypad.
  window.addEventListener("keydown", (e) => {
    // When a real mirror <button> holds DOM focus, native Tab/Enter + the mirror's own listeners
    // drive activation — don't fight them (same guard Citadel's input.ts uses).
    const active = document.activeElement;
    if (active !== null && a11yMount !== null && a11yMount.contains(active)) return;

    const consumed = dispatcher.key({ key: e.key, shiftKey: e.shiftKey }).consumed;
    if (consumed) {
      e.preventDefault();
      syncFocus();
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      actions.appendDigit(Number(e.key));
      e.preventDefault();
    } else if (e.key === "Backspace") {
      actions.backspace();
      e.preventDefault();
    } else if (e.key === "Enter") {
      actions.submit();
      e.preventDefault();
    }
  });

  // Boot the fight.
  post({ type: "init", seed: SEED });

  // --- Render loop ----------------------------------------------------------------------------
  function frame(): void {
    renderer.beginFrame();
    if (latest !== null) {
      const changed = screen.refresh(latest, typedValue);
      // computeLayout must run every frame AFTER refresh: refresh mutates layout specs (HP-bar
      // fill widths, swapped subtrees), and drawBars + hit-testing read the resulting rects.
      computeLayout(screen.root, 24, 24, MATE_THEME);
      surface.begin();
      renderTree(surface, screen.root, MATE_THEME);
      screen.drawBars(surface); // coloured HP fills, after layout gives fresh rects
      surface.end();
      if (changed) mirror?.update(screen.root); // reconcile a11y DOM only when the tree changed
    }
    renderer.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main();
