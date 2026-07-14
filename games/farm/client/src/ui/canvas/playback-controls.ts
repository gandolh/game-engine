/**
 * Farm Valley playback controls — Pause/Step/Skip/Speed + Help modal, rendered IN-CANVAS via
 * `@engine/ui`.
 *
 * Ports the old DOM `ui/playback-controls.ts` (`PlaybackControlsPanel`) onto the create/refresh
 * pattern established by `createResourceHud` (Citadel) / `createWorldClock` (Farm): a retained
 * widget tree built ONCE by {@link createPlaybackControls}, then `refresh(state)` re-binds button
 * labels/state each frame. Buttons are wired to `actions` — the SAME command path the old DOM
 * click handlers drove (mouse, keyboard via the dispatcher, and the a11y mirror all share it).
 *
 * The Help modal is a SECOND toggle-able root (mirrors Citadel's `SettingsModal` pattern): its
 * `getHelpRoot()` returns `null` while closed so the host's dispatcher/a11y-mirror pair for it is
 * inert, and returns the modal's `ContainerNode` while open. The `?` button toggles it; a Close
 * button and (by convention, wired by the host) Escape close it.
 *
 * ⚠️ Icon note: the DOM version used emoji glyphs (⏸ ⏭ ★) and non-ASCII bullets. `@engine/ui`'s
 * text stack (now the authored UNSCII pixel font) still only covers printable ASCII, so button
 * labels stay plain text ("Pause"/"Step"/"Skip") and the help modal's key-binding rows use the
 * literal key names. The `@engine/ui` icon set has no pause/step/skip glyphs (buildings/tools/
 * goods only), so there's nothing to swap the labels for yet.
 *
 * EDG32-only: every colour is an `EDG.*` constant.
 */
import { EDG } from "@engine/core";
import { box, button, label, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, LabelNode } from "@engine/ui";
import type { FarmerFsmState } from "@farm/sim-core/components/farmer";
import { personalityColor } from "../colors";

const KEY_BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ["WASD / Arrows", "Walk Pip one tile"],
  ["E", "Use the selected hotbar tool on the tile you face"],
  ["Space", "Recenter the camera on yourself"],
  ["1-8", "Select a hotbar slot"],
  ["P", "Pause / resume"],
  [".", "Step one tick (while paused)"],
  ["H", "Skip to next highlight (next high-drama event)"],
  ["Drag", "Pan the camera"],
  ["Scroll", "Zoom in / out"],
];

const TOOL_HELP: ReadonlyArray<readonly [string, string]> = [
  ["Can", "Water a planted, un-watered plot"],
  ["Hoe", "Till bare ground into soil"],
  ["Axe", "Chop a tree for wood"],
  ["Pickaxe", "Mine a stone for ore"],
  ["Rod", "Fish - stand on a fishing isle and cast into adjacent water"],
  ["Radish", "Plant radish seeds on your tilled plot"],
  ["Wheat", "Plant wheat seeds on your tilled plot"],
  ["Pumpkin", "Plant pumpkin seeds on your tilled plot"],
];

const PERSONALITY_HELP: ReadonlyArray<readonly [string, string]> = [
  [
    "conservative",
    "Plays it safe: waters every plot early, expands slowly, plants the cheapest in-season crop.",
  ],
  [
    "aggressive",
    "Chases profit: over-plants, expands fast, plants the priciest in-season crop, takes risks.",
  ],
  [
    "hoarder",
    "Accumulates: waters religiously, buys cheap offers, wins and keeps the golden bean.",
  ],
  [
    "opportunist",
    "Reads the market: plants by weather and season, posts at fair price or dumps by supply.",
  ],
];

const FSM_HELP: ReadonlyArray<readonly [FarmerFsmState, string]> = [
  ["WAIT_DAY", "Waiting at the start of the day for work to begin"],
  ["PERCEIVE", "Sensing the world - crops, prices, weather, neighbours"],
  ["DELIBERATE", "Choosing what to do next (its personality picks intentions)"],
  ["ACT", "Carrying out the chosen task"],
  ["FINISH_DAY", "Wrapping up the day's work"],
  ["SLEEP", "Resting at home for the night"],
];

const SPEEDS = [1, 2, 4] as const;

export interface PlaybackState {
  paused: boolean;
  speed: number;
}

/** Callbacks into the host's command path — the SAME ones the old DOM handlers invoked. */
export interface PlaybackActions {
  togglePause(): void;
  setSpeed(n: number): void;
  step(): void;
  skipToHighlight(): void;
}

/** The retained playback-controls bar plus its (separately toggleable) Help modal. */
export interface PlaybackControls {
  /** The controls-bar root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /** Returns the help modal's root while open, or `null` while closed (a second UI root). */
  getHelpRoot(): ContainerNode | null;
  /** Whether the help modal is currently open. */
  isHelpOpen(): boolean;
  /** Open the help modal. */
  openHelp(): void;
  /** Close the help modal. */
  closeHelp(): void;
  /** Toggle the help modal. */
  toggleHelp(): void;
  /**
   * Re-bind button labels/state from the latest playback state. Call once per frame.
   * Returns `true` when LAYOUT-AFFECTING content changed (the pause label flip); speed-highlight
   * state changes don't affect layout and are not folded in.
   */
  refresh(state: PlaybackState): boolean;
}

function sectionTitle(text: string): LabelNode {
  return label(text, { color: EDG.silver });
}

function helpRow(leftText: string, leftColor: string, desc: string): ContainerNode {
  return box({ direction: "row", gap: 12, align: "start" }, [
    label(leftText, { color: leftColor }),
    label(desc, { color: EDG.cream }),
  ]);
}

function buildHelpModal(onClose: () => void): ContainerNode {
  const closeBtn = button("Close", { onActivate: () => onClose() });
  const header = box({ direction: "row", gap: 16, align: "center" }, [
    label("How to play", { color: EDG.gold }),
    closeBtn,
  ]);

  const rows: ContainerNode[] = [];
  rows.push(box({ direction: "column" }, [sectionTitle("Controls")]));
  for (const [keys, desc] of KEY_BINDINGS) rows.push(helpRow(keys, EDG.gold, desc));

  rows.push(box({ direction: "column" }, [sectionTitle("Tools (select 1-8, use with E)")]));
  for (const [name, effect] of TOOL_HELP) rows.push(helpRow(name, EDG.gold, effect));

  rows.push(box({ direction: "column" }, [sectionTitle("Personalities")]));
  for (const [kind, gloss] of PERSONALITY_HELP) {
    rows.push(helpRow(kind, personalityColor(kind), gloss));
  }

  rows.push(box({ direction: "column" }, [sectionTitle("Farmer states (FSM)")]));
  for (const [state, gloss] of FSM_HELP) rows.push(helpRow(state, EDG.gold, gloss));

  return panel({ direction: "column", gap: 8, align: "stretch" }, [header, ...rows]);
}

/** Flip the pause button's label without disturbing its interaction state. */
function setPauseLabel(btn: ButtonNode, paused: boolean): boolean {
  const text = paused ? "Resume" : "Pause";
  if (btn.label === text) return false;
  btn.label = text;
  return true;
}

/** Mark a speed button as the active speed (pressed look) or release it, per resource-hud's pattern. */
function setSpeedActive(btn: ButtonNode, isActive: boolean): void {
  if (isActive) {
    if (btn.state === "normal") btn.state = "active";
  } else {
    if (btn.state === "active") btn.state = "normal";
  }
}

/**
 * Build the retained playback-controls widget tree (+ help modal). The tree is created once;
 * `refresh` mutates it per frame (no re-allocation).
 */
export function createPlaybackControls(actions: PlaybackActions): PlaybackControls {
  let helpOpen = false;

  const helpModal = buildHelpModal(() => {
    helpOpen = false;
  });

  const pauseBtn = button("Pause", { onActivate: () => actions.togglePause() });
  const stepBtn = button("Step", { onActivate: () => actions.step() });
  const skipBtn = button("Skip", { onActivate: () => actions.skipToHighlight() });
  const helpBtn = button("?", {
    onActivate: () => {
      helpOpen = !helpOpen;
    },
  });

  const speedButtons = new Map<number, ButtonNode>();
  const speedRow: ButtonNode[] = SPEEDS.map((mult) => {
    const b = button(`${mult}x`, { onActivate: () => actions.setSpeed(mult) });
    speedButtons.set(mult, b);
    return b;
  });

  const root = panel({ direction: "row", gap: 6, align: "center" }, [
    helpBtn,
    pauseBtn,
    stepBtn,
    skipBtn,
    box({ direction: "row", gap: 6, align: "center" }, speedRow),
  ]);

  let changed = false;
  let firstRefresh = true;

  function refresh(state: PlaybackState): boolean {
    changed = false;

    if (setPauseLabel(pauseBtn, state.paused)) changed = true;
    stepBtn.state = state.paused ? "normal" : "disabled";

    for (const [mult, btn] of speedButtons) setSpeedActive(btn, mult === state.speed);

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return {
    root,
    getHelpRoot: () => (helpOpen ? helpModal : null),
    isHelpOpen: () => helpOpen,
    openHelp: () => {
      helpOpen = true;
    },
    closeHelp: () => {
      helpOpen = false;
    },
    toggleHelp: () => {
      helpOpen = !helpOpen;
    },
    refresh,
  };
}
