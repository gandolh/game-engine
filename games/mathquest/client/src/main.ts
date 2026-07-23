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
 *   - **`"combat"`/`"level_up"`/`"loot"`/`"run_won"`/`"run_lost"`**: retained widget trees (M3's
 *     `ui/combat-screen.ts`/`ui/run-over-screen.ts`, plus M4a's
 *     (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md) `ui/levelup-screen.ts`/
 *     `ui/loot-screen.ts`), laid out via `computeLayout`/`renderTree`, hit-tested by the ONE
 *     `InputDispatcher`, mirrored into the hidden a11y DOM. Physical-keyboard digit/Backspace/
 *     Enter entry still edits the typed-answer buffer only while `mode === "combat"`.
 *
 * Sim/render boundary (root CLAUDE.md): this file only ever READS `GameSnapshot`s off the worker
 * and POSTS commands to it — it never mutates sim state directly. All run/combat logic +
 * randomness live in `@mathquest/sim-core`, behind the worker.
 *
 * M4c (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md) makes THIS FILE the persistence
 * owner: **the sim runs in a Web Worker, which has NO access to `localStorage`** — see
 * `run/mastery.ts`'s module doc for the full architecture. On boot, `loadMastery()` reads
 * `localStorage[MASTERY_STORAGE_KEY]` (wrapped in try/catch — private-mode/blocked storage must
 * degrade to `EMPTY_MASTERY_STORE`, never throw) and posts it in `init`. On every snapshot,
 * `persistMasteryIfChanged()` writes it back only when it actually changed (cheap: the store is
 * tiny, but a per-tick unconditional write would still be wasteful). The sim/worker itself never
 * touches `localStorage`/DOM.
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
import { EMPTY_MASTERY_STORE, MASTERY_STORAGE_KEY, parseMasteryStore } from "@mathquest/sim-core";
import type { AnswerResponse, GameSnapshot, MasteryStore } from "@mathquest/sim-core";
import { MATE_PAL } from "./render/mate-palette";
import { MATE_THEME } from "./render/mate-theme";
import { createCombatScreen, type CombatScreenActions } from "./ui/combat-screen";
import { createLevelUpScreen, type LevelUpScreenActions } from "./ui/levelup-screen";
import { createLootScreen, type LootScreenActions } from "./ui/loot-screen";
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

/** M4c: the ONLY place this file reads `localStorage` — `parseMasteryStore` itself already
 * tolerates null/corrupt/wrong-version JSON, but the `localStorage.getItem` call itself can throw
 * (private-mode browsers, storage disabled by policy), so THAT call is what's wrapped here. */
function loadMastery(): MasteryStore {
  try {
    return parseMasteryStore(localStorage.getItem(MASTERY_STORAGE_KEY));
  } catch {
    return EMPTY_MASTERY_STORE;
  }
}

/** M4c: the ONLY place this file writes `localStorage` — mirrors `loadMastery`'s try/catch (a
 * quota-exceeded or private-mode write can throw too); a failed write just means this session's
 * progress won't persist, never a crash. Takes the ALREADY-serialized string (the caller computed
 * it once to decide whether anything changed) rather than re-stringifying here. */
function saveMastery(serialized: string): void {
  try {
    localStorage.setItem(MASTERY_STORAGE_KEY, serialized);
  } catch {
    // Storage unavailable/full — degrade silently, same as `loadMastery`.
  }
}

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
  // M4c: the LAST mastery payload actually written, so a snapshot whose mastery hasn't changed
  // since the last write never re-serializes/re-writes it (the sim posts a snapshot after every
  // command AND on every paced tick — most of those don't touch mastery at all).
  let lastPersistedMastery = JSON.stringify(EMPTY_MASTERY_STORE);
  worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
    const msg = event.data;
    if (msg.type === "snapshot") {
      latest = msg.snapshot;
      const serialized = JSON.stringify(msg.snapshot.run.mastery);
      if (serialized !== lastPersistedMastery) {
        lastPersistedMastery = serialized;
        saveMastery(serialized);
      }
    }
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
      // M4b: harden against a keyboard/edge path submitting a "fifty"-disabled choice — the
      // widget itself already refuses to hit-test/focus a disabled button, but this is the ONE
      // place a raw index reaches the sim, so check it here too (belt-and-braces).
      const problem = latest !== null && latest.mode === "combat" ? latest.combat.problem : null;
      if (problem !== null && problem.kind === "choice" && problem.disabledChoices.includes(index)) return;
      const response: AnswerResponse = { kind: "choice", index };
      post({ type: "submit-answer", response });
    },
    acknowledgeTeach() {
      post({ type: "acknowledge-teach" });
    },
    useLifeline(kind) {
      post({ type: "use-lifeline", kind });
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
  // Map-mode camera drag: a press becomes a PAN once the pointer moves past a small threshold;
  // a press that never crosses it is a node CLICK on release (so panning never mis-selects a node).
  let panDown = false;
  let panDragging = false;
  let panLastX = 0;
  let panLastY = 0;
  let panStartX = 0;
  let panStartY = 0;
  const PAN_THRESHOLD = 5; // px of movement before a press is treated as a drag
  const KEY_PAN_STEP = 90; // px per arrow-key press

  const runOverActions: RunOverScreenActions = {
    newRun() {
      post({ type: "new-run" });
    },
  };
  const runOverScreen = createRunOverScreen(runOverActions);

  // M4a: the level-up + loot screens, same build-once-tree/per-frame-refresh shape as the above.
  const levelUpActions: LevelUpScreenActions = {
    chooseUpgrade(index) {
      post({ type: "choose-level-up", index });
    },
  };
  const levelUpScreen = createLevelUpScreen(levelUpActions);

  const lootActions: LootScreenActions = {
    chooseLoot(index) {
      post({ type: "choose-loot", index });
    },
    skipLoot() {
      post({ type: "choose-loot", index: -1 });
    },
  };
  const lootScreen = createLootScreen(lootActions);

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
      case "level_up":
        return levelUpScreen.root;
      case "loot":
        return lootScreen.root;
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
    // Map mode: a press starts a potential camera PAN (resolved as a click on release if it never
    // crosses PAN_THRESHOLD). Bypasses the widget dispatcher entirely.
    if (latest !== null && latest.mode === "map") {
      panDown = true;
      panDragging = false;
      panStartX = x;
      panStartY = y;
      panLastX = x;
      panLastY = y;
      return;
    }
    dispatcher.pointerDown(x, y);
    syncFocus();
  });
  canvas.addEventListener("mouseup", (e) => {
    const { x, y } = cssPx(e);
    if (latest !== null && latest.mode === "map") {
      // A press that never became a drag is a node click; a reachable node advances the run.
      if (panDown && !panDragging) {
        const id = mapScreen.nodeAtScreen(x, y);
        if (id !== null && latest.run.reachableIds.includes(id)) post({ type: "choose-node", id });
      }
      panDown = false;
      panDragging = false;
      return;
    }
    dispatcher.pointerUp(x, y);
  });
  canvas.addEventListener("mouseleave", () => {
    panDown = false;
    panDragging = false;
  });
  canvas.addEventListener("mousemove", (e) => {
    const { x, y } = cssPx(e);
    if (latest !== null && latest.mode === "map") {
      if (panDown) {
        if (Math.abs(x - panStartX) + Math.abs(y - panStartY) > PAN_THRESHOLD) panDragging = true;
        if (panDragging) {
          mapScreen.panBy(panLastX - x, panLastY - y); // world moves opposite the drag
          panLastX = x;
          panLastY = y;
          hoverId = null;
        }
      } else {
        hoverId = mapScreen.nodeAtScreen(x, y);
      }
      return;
    }
    dispatcher.pointerMove(x, y);
  });
  // Map-mode wheel → horizontal scroll (vertical wheel maps to horizontal, the journey's main axis).
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (latest === null || latest.mode !== "map") return;
      mapScreen.panBy((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY), 0);
      e.preventDefault();
    },
    { passive: false },
  );

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
      // Arrow keys pan the camera; 1..9 / Enter select among reachable nodes.
      if (e.key === "ArrowLeft") {
        mapScreen.panBy(-KEY_PAN_STEP, 0);
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowRight") {
        mapScreen.panBy(KEY_PAN_STEP, 0);
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowUp") {
        mapScreen.panBy(0, -KEY_PAN_STEP);
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        mapScreen.panBy(0, KEY_PAN_STEP);
        e.preventDefault();
        return;
      }
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

  // Boot the run. M4c: the persistent mastery store is read from localStorage HERE (main thread
  // only — the worker has no such access) and ferried in on `init`.
  post({ type: "init", seed: SEED, mastery: loadMastery() });

  // --- Render loop ----------------------------------------------------------------------------
  function frame(): void {
    renderer.beginFrame();
    if (latest !== null) {
      const snapshot = latest;
      if (snapshot.mode === "map") {
        // Custom-drawn: one pass, no widget tree. Full-viewport: the map lays out + scrolls within
        // the live canvas CSS size (UI is drawn in CSS px; see the render pipeline).
        surface.begin();
        mapScreen.render(surface, snapshot.run, hoverId, canvas.clientWidth, canvas.clientHeight);
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
              changed = combatScreen.refresh(snapshot.combat, typedValue, snapshot.run.lifelines);
              break;
            case "level_up":
              changed = levelUpScreen.refresh(snapshot.offers);
              break;
            case "loot":
              changed = lootScreen.refresh(snapshot.offers);
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
          if (snapshot.mode === "combat") {
            combatScreen.drawBars(surface);
            // M5 slice 3: folklore creature + hero sprites, painted over the widget layer as a
            // right-of-screen battle scene (screen-space — needs the live canvas size).
            combatScreen.drawSprites(surface, snapshot.combat, canvas.clientWidth, canvas.clientHeight);
          }
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
