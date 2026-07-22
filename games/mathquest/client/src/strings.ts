/**
 * MateQuest — centralized user-facing strings (EN only for now). Full RO/EN i18n is a later
 * milestone (M5, per corpus/wiki/mathquest-overview.md); keeping every string here now means M5
 * can swap this module for a locale-aware lookup without touching any widget code. Generator-
 * produced `prompt`/`teach` text (in `@mathquest/sim-core/combat/generators.ts`) is inline for the
 * same reason (M2 brief note) — it isn't UI chrome, it's curriculum content.
 */
import type { CombatAction, EnemyResult, Grade, PlayerResult } from "@mathquest/sim-core";

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

  continueLabel: "Continue",
  teachTitle: "Learn:",

  gradeSelectorLabel: "Grade:",
  gradeLabel: {
    1: "I",
    2: "II",
    3: "III",
    4: "IV",
  } satisfies Record<Grade, string>,

  turnLabel: (turn: number): string => `Turn ${turn}`,

  /** The PLAYER's own result-cue line, rendered from `CombatSnapshot.lastPlayer`. Kept on its OWN
   * line — separate from `enemyResultCue` — so it is never overwritten by the enemy's hit
   * (M2 fold-in of the M1 known-minor). */
  playerResultCue(last: PlayerResult): string {
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
    }
  },

  /** The ENEMY's result-cue line, rendered from `CombatSnapshot.lastEnemy`. */
  enemyResultCue(last: EnemyResult, enemyName: string): string {
    switch (last.kind) {
      case "none":
        return "";
      case "enemy_hit":
        return last.blocked > 0
          ? `${enemyName} hits for ${last.amount} (${last.blocked} blocked)`
          : `${enemyName} hits for ${last.amount}`;
    }
  },
} as const;
