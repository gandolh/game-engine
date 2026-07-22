/**
 * MateQuest — browser entry point.
 *
 * M1 booted the sim worker and rendered ONE screen (the combat loop) every frame. M3
 * (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part B) wraps that fight in a RUN: this
 * file now switches which retained `@engine/ui` screen it renders by the latest `GameSnapshot`'s
 * `mode` — `"map"` -> `ui/map-screen.ts`, `"combat"` -> the existing `ui/combat-screen.ts`
 * (reused, its M2 grade selector removed), `"run_won"`/`"run_lost"` -> `ui/run-over-screen.ts`.
 * ONE `InputDispatcher` + a11y mirror still cover whichever screen's root is current — the root
 * PROVIDER swaps by mode, the same way `combat-screen.ts` swaps its own dynamic subtree by phase.
 *
 * Wiring (mirrors Citadel's `main/hud-panels.ts` + `main/input.ts`, stripped to ONE UI root at a
 * time since MateQuest has no world layer underneath the UI):
 *   - a single `InputDispatcher` hit-tests the CURRENT screen's tree; canvas pointer events are
 *     forwarded to it in CSS-logical px (clientX − rect.left; NOT device px).
 *   - a hidden a11y mirror reflects the CURRENT tree into DOM and bridges focus both ways.
 *   - physical-keyboard entry (digits / Backspace / Enter) edits the SAME typed-answer buffer the
 *     on-screen keypad does, ONLY while `mode === "combat"` — it's meaningless on the map/run-over
 *     screens.
 *
 * Sim/render boundary (root CLAUDE.md): this file only ever READS `GameSnapshot`s off the worker
 * and POSTS commands to it — it never mutates sim state directly. All run/combat logic +
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
  type ContainerNode,
  type InputDispatcher,
  type A11yMirror,
} from "@engine/ui";
import type { AnswerResponse, GameSnapshot } from "@mathquest/sim-core";
import { MATE_PAL } from "./render/mate-palette";
import { MATE_THEME } from "./render/mate-theme";
import { createCombatScreen, type CombatScreenActions } from "./ui/combat-screen";
import { createMapScreen, type MapScreenActions } from "./ui/map-screen";
import { createRunOverScreen, type RunOverScreenActions } from "./ui/run-over-screen";
import type { WorkerInbound, WorkerOutbound } from "./worker/sim-worker";

// M3 has no run/seed-select screen yet — a fixed seed proves the deterministic-seed seam and
// gives a repeatable run. `newRun()` (posted as `new-run`) regenerates the map from a FRESH fork
// of this same seed's Rng (see `sim-bootstrap.ts`), never re-rolling `SEED` itself.
const SEED = 1;
// M2's grade-4 typed answers can run up to 4 digits (e.g. a 2-digit × 2-digit product up to
// 9801, or a grade-4 sum up to ~9998) — 5 digits leaves headroom without letting the buffer grow
// unbounded if the player mashes the keypad.
const MAX_ANSWER_DIGITS = 5;

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

  let latest: GameSnapshot | null = null;
  worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
    const msg = event.data;
    if (msg.type === "snapshot") latest = msg.snapshot;
  });

  // --- Typed-answer buffer (host-side; the sim never sees a partial answer) --------------------
  let typedValue = "";

  const combatActions: CombatScreenActions = {
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
      const response: AnswerResponse = { kind: "typed", value: Number(typedValue) };
      post({ type: "submit-answer", response });
      typedValue = "";
    },
    submitChoice(index) {
      const response: AnswerResponse = { kind: "choice", index };
      post({ type: "submit-answer", response });
    },
    acknowledgeTeach() {
      post({ type: "acknowledge-teach" });
    },
    restart() {
      // Dead in practice (see the module doc — the run driver resolves a fight's win/loss into
      // "map"/"run_won"/"run_lost" atomically, so the client never observes a bare combat
      // "won"/"lost" phase to show this banner over) but wired for completeness: fall back to
      // the run-level restart command.
      typedValue = "";
      post({ type: "new-run" });
    },
  };
  const combatScreen = createCombatScreen(combatActions);

  const mapActions: MapScreenActions = {
    chooseNode(id) {
      post({ type: "choose-node", id });
    },
  };
  const mapScreen = createMapScreen(mapActions);

  const runOverActions: RunOverScreenActions = {
    newRun() {
      post({ type: "new-run" });
    },
  };
  const runOverScreen = createRunOverScreen(runOverActions);

  /** Which retained screen is current, by the latest snapshot's `mode`. Defaults to the map
   * screen before the first snapshot arrives (there is nothing meaningful to show/hit-test yet,
   * but the dispatcher/mirror need SOME root). */
  function currentRoot(): ContainerNode {
    if (latest === null) return mapScreen.root;
    switch (latest.mode) {
      case "map":
        return mapScreen.root;
      case "combat":
        return combatScreen.root;
      case "run_won":
      case "run_lost":
        return runOverScreen.root;
    }
  }

  // --- Input: ONE dispatcher over whichever screen root is CURRENT + a focus-bridged a11y mirror
  const dispatcher: InputDispatcher = createInputDispatcher(currentRoot);
  let mirror: A11yMirror | undefined;
  if (a11yMount !== null) {
    mirror = createA11yMirror(a11yMount, {
      rootLabel: "MateQuest",
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
  // button). If it didn't consume the key AND we're mid-fight, treat digits/Backspace/Enter as
  // answer entry — meaningless on the map/run-over screens, so gated on `mode === "combat"`.
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
    if (latest === null || latest.mode !== "combat") return;
    if (/^[0-9]$/.test(e.key)) {
      combatActions.appendDigit(Number(e.key));
      e.preventDefault();
    } else if (e.key === "Backspace") {
      combatActions.backspace();
      e.preventDefault();
    } else if (e.key === "Enter") {
      combatActions.submit();
      e.preventDefault();
    }
  });

  // Boot the run.
  post({ type: "init", seed: SEED });

  // --- Render loop ----------------------------------------------------------------------------
  function frame(): void {
    renderer.beginFrame();
    if (latest !== null) {
      const snapshot = latest;
      const root = currentRoot();
      let changed: boolean;
      switch (snapshot.mode) {
        case "map":
          changed = mapScreen.refresh(snapshot.run);
          break;
        case "combat":
          changed = combatScreen.refresh(snapshot.combat, typedValue);
          break;
        case "run_won":
        case "run_lost":
          changed = runOverScreen.refresh(snapshot.mode, snapshot.run);
          break;
      }
      // computeLayout must run every frame AFTER refresh: refresh mutates layout specs (HP-bar
      // fill widths, swapped subtrees), and drawBars/drawChips + hit-testing read the resulting
      // rects.
      computeLayout(root, 24, 24, MATE_THEME);
      surface.begin();
      renderTree(surface, root, MATE_THEME);
      if (snapshot.mode === "map") mapScreen.drawChips(surface);
      else if (snapshot.mode === "combat") combatScreen.drawBars(surface);
      surface.end();
      if (changed) mirror?.update(root); // reconcile a11y DOM only when the tree changed
    }
    renderer.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main();
