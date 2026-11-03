import { APOLLO, EDG32, RESURRECT64 } from "@engine/core/render";

/**
 * The palette each game's card art must stay on: the game's own (CLAUDE.md → the per-game
 * palettes). Farm is EDG32, Citadel and Hollow are Apollo-46, MateQuest is Resurrect-64.
 */
export const CARD_PALETTES: Readonly<Record<string, readonly string[]>> = {
  "farm-valley": EDG32,
  citadel: APOLLO,
  hollow: APOLLO,
  mathquest: RESURRECT64,
};
