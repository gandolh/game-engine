/**
 * MateQuest — centralized user-facing strings (EN only for now). Full RO/EN i18n is a later
 * milestone (M5, per corpus/wiki/mathquest-overview.md); keeping every string here now means M5
 * can swap this module for a locale-aware lookup without touching any widget code. Generator-
 * produced `prompt`/`teach` text (in `@mathquest/sim-core/combat/generators.ts`) is inline for the
 * same reason (M2 brief note) — it isn't UI chrome, it's curriculum content.
 */
import type { CombatAction, EnemyResult, Grade, NodeType, PlayerResult } from "@mathquest/sim-core";

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

  gradeLabel: {
    1: "I",
    2: "II",
    3: "III",
    4: "IV",
  } satisfies Record<Grade, string>,

  /** M3: the combat screen's READ-ONLY grade line (the fight's difficulty came from the chosen
   * map node — see `ui/map-screen.ts` — not a mid-fight selector). */
  gradeReadout(grade: Grade): string {
    return `Grade: ${STRINGS.gradeLabel[grade]}`;
  },

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

  // --- M3: map screen (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part B) -----------

  mapTitle: "Choose your path",
  warriorHpLabel: "Warrior",

  /** A map node's button label: type + grade, exactly the brief's examples ("⚔ G2", "★ Elite G3",
   * "☾ Rest", "☠ Boss G4"). `"rest"` carries no grade (ignored, per `run/map.ts`'s `MapNode` doc). */
  nodeLabel(type: NodeType, grade: Grade): string {
    switch (type) {
      case "combat":
        return `⚔ G${grade}`;
      case "elite":
        return `★ Elite G${grade}`;
      case "rest":
        return `☾ Rest`;
      case "boss":
        return `☠ Boss G${grade}`;
    }
  },

  /** Prefixed onto an already-visited node's label so a resolved node reads differently from a
   * merely-unreachable one (both end up `state: "disabled"` — see `ui/map-screen.ts`). */
  visitedPrefix: "✓ ",

  legendTitle: "Legend:",
  legendLabel: {
    combat: "Combat",
    elite: "Elite (harder)",
    rest: "Rest (heals)",
    boss: "Boss",
  } satisfies Record<NodeType, string>,

  // --- M3: run-over screen ------------------------------------------------------------------

  runWon: "Ai învins!",
  runLost: "Ai pierdut",
  newRun: "Rulare nouă",
} as const;
