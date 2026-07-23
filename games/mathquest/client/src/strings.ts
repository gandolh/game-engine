/**
 * MateQuest — centralized user-facing strings. **Romanian is the default language** (per the user
 * directive 2026-07-22); a locale toggle is a later milestone (M5), at which point this module
 * becomes a locale-aware lookup with RO as the default entry — keeping every string here now means
 * that swap touches no widget code. Generator-produced `prompt`/`teach` text (in
 * `@mathquest/sim-core/combat/generators.ts`) is Romanian inline for the same reason (it's
 * curriculum content, not UI chrome). All Romanian diacritics render (the @engine/ui font carries
 * them, incl. comma-below ș/ț).
 */
import type { CombatAction, EnemyResult, Grade, NodeType, PlayerResult, StatBonuses } from "@mathquest/sim-core";

export const STRINGS = {
  title: "MateQuest — Cetatea Cifrelor",

  actionLabel: {
    attack: "Atacă",
    heal: "Vindecă",
    shield: "Scut",
  } satisfies Record<CombatAction, string>,

  enemyIntentPrefix: "†",
  warriorBlockPrefix: "◆",

  submit: "Trimite",
  backspace: "←",
  typedPlaceholder: "?",

  won: "Victorie!",
  lost: "Înfrângere",
  restart: "Din nou",

  continueLabel: "Mai departe",
  teachTitle: "Învață:",

  gradeLabel: {
    1: "I",
    2: "II",
    3: "III",
    4: "IV",
  } satisfies Record<Grade, string>,

  /** The combat screen's READ-ONLY class line (the fight's difficulty came from the chosen map node
   * — see `ui/map-screen.ts` — not a mid-fight selector). */
  gradeReadout(grade: Grade): string {
    return `Clasa: ${STRINGS.gradeLabel[grade]}`;
  },

  turnLabel: (turn: number): string => `Tura ${turn}`,

  /** The PLAYER's own result-cue line, rendered from `CombatSnapshot.lastPlayer`. Kept on its OWN
   * line — separate from `enemyResultCue` — so it is never overwritten by the enemy's hit. */
  playerResultCue(last: PlayerResult): string {
    switch (last.kind) {
      case "none":
        return "";
      case "landed": {
        if (last.action === "attack") return `Lovitură! -${last.amount}`;
        if (last.action === "heal") return `Vindecare! +${last.amount}`;
        return `Scut! +${last.amount} blocaj`;
      }
      case "fizzle":
        return "Ratat!";
    }
  },

  /** The ENEMY's result-cue line, rendered from `CombatSnapshot.lastEnemy`. */
  enemyResultCue(last: EnemyResult, enemyName: string): string {
    switch (last.kind) {
      case "none":
        return "";
      case "enemy_hit":
        return last.blocked > 0
          ? `${enemyName} lovește cu ${last.amount} (${last.blocked} blocat)`
          : `${enemyName} lovește cu ${last.amount}`;
    }
  },

  // --- map screen ------------------------------------------------------------------------------

  mapTitle: "Alege-ți drumul",
  warriorHpLabel: "Războinic",

  /** The four zone banners along the horizontal journey, indexed by zone (left→right). The last is
   * the boss zone. Purely cosmetic (see `ui/map-screen.ts`'s `ZONES`). */
  zoneName: ["Pădurea Adâncă", "Satul", "Munții Carpați", "Bârlogul Zmeului"] as const,

  /** A map node's one-line label (glyph + class), still used by the legend + any text fallback.
   * Glyphs are limited to the @engine/ui font's symbol set († ★ ♥ ♠ — ⚔/☾/☠ aren't in UNSCII). */
  nodeLabel(type: NodeType, grade: Grade): string {
    switch (type) {
      case "combat":
        return `† ${STRINGS.gradeLabel[grade]}`;
      case "elite":
        return `★ Elită ${STRINGS.gradeLabel[grade]}`;
      case "rest":
        return `♥ Odihnă`;
      case "boss":
        return `♠ Boss ${STRINGS.gradeLabel[grade]}`;
    }
  },

  /** Prefixed onto an already-visited node so a cleared node reads differently. */
  visitedPrefix: "✓",

  legendTitle: "Legendă:",
  legendLabel: {
    combat: "Luptă",
    elite: "Elită (greu)",
    rest: "Odihnă (vindecă)",
    boss: "Boss",
  } satisfies Record<NodeType, string>,

  // --- run-over screen ------------------------------------------------------------------------

  runWon: "Ai învins!",
  runLost: "Ai pierdut",
  newRun: "Rulare nouă",

  // --- M4a: level-up screen ---------------------------------------------------------------------

  levelUpTitle: "Ai avansat!",

  // --- M4a: loot screen --------------------------------------------------------------------------

  lootTitle: "Pradă!",
  lootSkip: "Sari peste",

  // --- M4a: stat bonuses (loot item cards + the map HUD's readout) -------------------------------

  statLabel: {
    atk: "Atac",
    maxHp: "PS",
    block: "Blocaj",
    heal: "Vindecare",
  } satisfies Record<keyof StatBonuses, string>,

  /** "+2 Atac, +3 Blocaj" style summary of every non-zero stat in a (possibly partial) bonus
   * object, in a FIXED atk/maxHp/block/heal order — used by loot item cards AND the map HUD's
   * stat readout (`ui/map-screen.ts`'s `drawChrome`). Empty string when every stat is 0/absent. */
  bonusSummary(bonus: Partial<StatBonuses>): string {
    const parts: string[] = [];
    if ((bonus.atk ?? 0) !== 0) parts.push(`+${bonus.atk} ${STRINGS.statLabel.atk}`);
    if ((bonus.maxHp ?? 0) !== 0) parts.push(`+${bonus.maxHp} ${STRINGS.statLabel.maxHp}`);
    if ((bonus.block ?? 0) !== 0) parts.push(`+${bonus.block} ${STRINGS.statLabel.block}`);
    if ((bonus.heal ?? 0) !== 0) parts.push(`+${bonus.heal} ${STRINGS.statLabel.heal}`);
    return parts.join(", ");
  },

  // --- M4a: map HUD progression readout ------------------------------------------------------------

  levelLabel(level: number): string {
    return `Nivel ${level}`;
  },
  xpLabel(xp: number, xpNext: number): string {
    return `XP ${xp}/${xpNext}`;
  },
} as const;
