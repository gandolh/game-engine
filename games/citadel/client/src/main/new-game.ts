import { createInputDispatcher, createA11yMirror } from "@engine/ui";
import type { InputDispatcher, A11yMirror } from "@engine/ui";
import { NewGameModal } from "../ui/new-game-modal";
import type { GameMode } from "../ui/new-game-modal";
import { newGameA11yMount } from "./dom";

// New-game mode picker (brief 103): a SEVENTH in-canvas UI root — the cozy/challenge choice, shown
// at boot BEFORE `client.init()` runs, so the sim starts under the ruleset the player picked. Same
// shape as the settings modal (centred dialog, own dispatcher + own hidden a11y mount) with one
// difference: it is NOT dismissable (no Close, no Escape) — until it is answered there is no game.
// Created by initNewGameModal() (it needs to know whether a URL flag already answered it);
// undefined until then.
export let newGameModal: NewGameModal | undefined;
export let newGameDispatcher: InputDispatcher | undefined;
export let newGameMirror: A11yMirror | undefined;

/** True while the picker is up — the sim has not been inited, so nothing may drive the world. */
export function newGameOpen(): boolean {
  return newGameModal?.isOpen() ?? false;
}

/**
 * Brief 103: the ruleset is chosen at founding, in-canvas, BEFORE the sim is inited — the
 * picker is a SEVENTH UI root with its own dispatcher + a11y mirror. It is not dismissable, so
 * no Escape/close wiring. Called once from boot.ts, which computes `preChosen` from the URL /
 * `?mp` fast-paths and supplies `onChoose` (boot.ts's `startGame`).
 */
export function initNewGameModal(preChosen: GameMode | null, onChoose: (mode: GameMode) => void): void {
  newGameModal = new NewGameModal(
    { onChoose },
    { openAtStart: preChosen === null },
  );
  newGameDispatcher = createInputDispatcher(() => (newGameOpen() ? newGameModal?.root ?? null : null));
  if (newGameA11yMount !== null) {
    newGameMirror = createA11yMirror(newGameA11yMount, {
      rootLabel: "New game",
      onFocusNode: (id) => {
        if (newGameDispatcher === undefined) return;
        if (id === null) newGameDispatcher.blur();
        else newGameDispatcher.focus(id);
      },
    });
  }
}
