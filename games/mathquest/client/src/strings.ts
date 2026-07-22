/**
 * MateQuest M1 — centralized user-facing strings (EN only for now). Full RO/EN i18n is a later
 * milestone (M5, per corpus/wiki/mathquest-overview.md); keeping every string here now means M5
 * can swap this module for a locale-aware lookup without touching any widget code.
 */
import type { CombatAction, LastResult } from "@mathquest/sim-core";

export const STRINGS = {
  title: "MateQuest — Cetatea Cifrelor",

  actionLabel: {
    attack: "Attack",
    heal: "Heal",
    shield: "Shield",
  } satisfies Record<CombatAction, string>,

  enemyIntentPrefix: "⚔",
  warriorBlockPrefix: "🛡",

  submit: "Enter",
  backspace: "⌫",
  typedPlaceholder: "?",

  won: "Victory!",
  lost: "Defeat",
  restart: "Restart",

  turnLabel: (turn: number): string => `Turn ${turn}`,

  /** The result-cue line rendered from `CombatSnapshot.last`. */
  resultCue(last: LastResult, enemyName: string): string {
    switch (last.kind) {
      case "none":
        return "";
      case "landed": {
        if (last.action === "attack") return `Hit! -${last.amount}`;
        if (last.action === "heal") return `Heal! +${last.amount}`;
        return `Shield up! +${last.amount} block`;
      }
      case "fizzle":
        return "Fizzle!";
      case "enemy_hit":
        return last.blocked > 0
          ? `${enemyName} hits for ${last.amount} (${last.blocked} blocked)`
          : `${enemyName} hits for ${last.amount}`;
    }
  },
} as const;
