/**
 * MateQuest — browser entry point.
 *
 * M1 booted the sim worker and rendered ONE screen (the combat loop) every frame. M3
 * (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part B) wrapped that fight in a RUN,
 * switching which screen it renders by the latest `GameSnapshot`'s `mode`. M3.1
 * (corpus/todos/2026-07-22-mathquest-M3.1-spatial-map.md) replaces the `"map"` mode's screen with
 * a CUSTOM-DRAWN spatial map (`ui/map-screen.ts`) instead of a retained `@engine/ui` widget tree —
 * so this file is now genuinely MODE-AWARE, not just root-swapping, for input:
 *
 *   - **`"map"`**: `mapScreen.render()` draws the whole screen directly each frame (no
 *     `computeLayout`/`renderTree`). Canvas clicks hit-test via `mapScreen.nodeAt` and post
 *     `choose-node` directly (bypassing the widget `InputDispatcher` entirely); `1`..`9`/Enter
 *     select among `mapScreen.reachableOrder`. The widget dispatcher's root-provider
 *     (`currentWidgetRoot`) returns `null` in this mode so a stray widget hit-test can't fire, and
 *     the a11y mirror is cleared (a full DOM mirror for the spatial map is a known follow-up —
 *     see `ui/map-screen.ts`'s module doc).
 *   - **`"combat"`/`"run_won"`/`"run_lost"`**: UNCHANGED from M3 — the existing
 *     `ui/combat-screen.ts`/`ui/run-over-screen.ts` retained widget trees, laid out via
 *     `computeLayout`/`renderTree`, hit-tested by the ONE `InputDispatcher`, mirrored into the
 *     hidden a11y DOM. Physical-keyboard digit/Backspace/Enter entry still edits the typed-answer
 *     buffer only while `mode === "combat"`.
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
import { createMapScreen } from "./ui/map-screen";
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

  // M3.1: the map screen is custom-drawn (no widget tree, no actions) — `main.ts` owns
  // click/keyboard → `choose-node` directly (see below) instead of an `onActivate` callback.
  const mapScreen = createMapScreen();
  /** Hover target for the map's reachable-node highlight, tracked from `mousemove` in map mode. */
  let hoverId: number | null = null;

  const runOverActions: RunOverScreenActions = {
    newRun() {
      post({ type: "new-run" });
    },
  };
  const runOverScreen = createRunOverScreen(runOverActions);

  /** Which WIDGET screen root is current, by the latest snapshot's `mode` — `null` in `"map"`
   * mode (the spatial map has no widget tree) and before the first snapshot arrives. Used both as
   * the `InputDispatcher`'s root-provider (so stray widget hit-tests never fire on the map) and by
   * `frame()` to decide whether to run the widget `computeLayout`/`renderTree` path at all. */
  function currentWidgetRoot(): ContainerNode | null {
    if (latest === null) return null;
    switch (latest.mode) {
      case "map":
        return null;
      case "combat":
        return combatScreen.root;
      case "run_won":
      case "run_lost":
        return runOverScreen.root;
    }
  }

  // --- Input: ONE dispatcher over whichever WIDGET screen root is CURRENT (null on the map) + a
  // focus-bridged a11y mirror.
  const dispatcher: InputDispatcher = createInputDispatcher(currentWidgetRoot);
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
    // Map mode: bypass the widget dispatcher entirely — hit-test the spatial layout directly and
    // post `choose-node` only for a reachable target (brief: "unreachable node rejected").
    if (latest !== null && latest.mode === "map") {
      const id = mapScreen.nodeAt(x, y);
      if (id !== null && latest.run.reachableIds.includes(id)) {
        post({ type: "choose-node", id });
      }
      return;
    }
    dispatcher.pointerDown(x, y);
    syncFocus();
  });
  canvas.addEventListener("mouseup", (e) => {
    if (latest !== null && latest.mode === "map") return; // map clicks resolve on mousedown, no drag/release semantics
    const { x, y } = cssPx(e);
    dispatcher.pointerUp(x, y);
  });
  canvas.addEventListener("mousemove", (e) => {
    const { x, y } = cssPx(e);
    if (latest !== null && latest.mode === "map") {
      hoverId = mapScreen.nodeAt(x, y);
      return;
    }
    dispatcher.pointerMove(x, y);
  });

  // Keyboard. Map mode gets its OWN accessible-fallback handling (`1`..`9` / Enter select among
  // the reachable nodes) and returns early — it never reaches the widget dispatcher (whose root is
  // `null` there anyway) or the combat typed-answer path. Combat/run-over keyboard handling below
  // is UNCHANGED from M3: the dispatcher gets first refusal (Tab traversal, Enter/Space on a
  // focused button), then un-consumed digits/Backspace/Enter feed the typed-answer buffer while
  // `mode === "combat"`.
  window.addEventListener("keydown", (e) => {
    // When a real mirror <button> holds DOM focus, native Tab/Enter + the mirror's own listeners
    // drive activation — don't fight them (same guard Citadel's input.ts uses).
    const active = document.activeElement;
    if (active !== null && a11yMount !== null && a11yMount.contains(active)) return;

    if (latest !== null && latest.mode === "map") {
      const order = mapScreen.reachableOrder(latest.run);
      let id: number | undefined;
      if (/^[1-9]$/.test(e.key)) id = order[Number(e.key) - 1];
      else if (e.key === "Enter") id = order[0];
      if (id !== undefined) {
        post({ type: "choose-node", id });
        e.preventDefault();
      }
      return;
    }

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
      if (snapshot.mode === "map") {
        // Custom-drawn: one pass, no widget tree, no computeLayout/renderTree.
        surface.begin();
        mapScreen.render(surface, snapshot.run, hoverId);
        surface.end();
        // No DOM mirror for the spatial map yet (known follow-up — see ui/map-screen.ts's module
        // doc); clear it so a stale combat/run-over mirror never lingers into map mode.
        mirror?.update(null);
      } else {
        const root = currentWidgetRoot();
        if (root !== null) {
          let changed: boolean;
          switch (snapshot.mode) {
            case "combat":
              changed = combatScreen.refresh(snapshot.combat, typedValue);
              break;
            case "run_won":
            case "run_lost":
              changed = runOverScreen.refresh(snapshot.mode, snapshot.run);
              break;
          }
          // computeLayout must run every frame AFTER refresh: refresh mutates layout specs
          // (HP-bar fill widths, swapped subtrees), and drawBars + hit-testing read the resulting
          // rects.
          computeLayout(root, 24, 24, MATE_THEME);
          surface.begin();
          renderTree(surface, root, MATE_THEME);
          if (snapshot.mode === "combat") combatScreen.drawBars(surface);
          surface.end();
          if (changed) mirror?.update(root); // reconcile a11y DOM only when the tree changed
        }
      }
    }
    renderer.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main();
