/**
 * MateQuest — centralized user-facing strings. **Romanian is the default language.**
 *
 * M5 slice 2 (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md) turns the M1-M4 single RO
 * `STRINGS` object into the LOCKED bilingual seam: a `Strings` interface (the exact pre-slice-2
 * `STRINGS` shape — every plain label + formatter fn), two implementations `STRINGS_RO`
 * (verbatim, unchanged values) and `STRINGS_EN` (a full translation), and `getStrings(locale)` to
 * pick between them (default RO on anything else, mirroring `@mathquest/sim-core`'s
 * `parseLocale`'s "validate-or-default" story).
 *
 * **Screens receive the resolved `Strings` at CONSTRUCTION** (`createCombatScreen(actions,
 * strings)`, etc.) — see each `ui/*-screen.ts` file. `main.ts` owns the current `locale` +
 * `Strings` and REBUILDS every widget screen on a locale toggle (the LOCKED architecture: toggling
 * locale re-inits the whole sim in the new language, so the client's screens must be rebuilt in
 * lockstep — no mixed-locale UI). `ui/map-screen.ts` (custom-drawn, no widget tree) instead reads
 * the current `Strings` each frame, passed into `render(...)`.
 *
 * Generator-produced `prompt`/`teach` text and enemy `name`/`title` (in
 * `@mathquest/sim-core/combat/generators.ts` / `run/enemies.ts`) are localized SIM-SIDE (the LOCKED
 * M5 slice 2 architecture — see `@mathquest/sim-core/i18n.ts`'s module doc) via the sim's own
 * `locale` init option, not through this module — this file covers CLIENT UI chrome only. All
 * Romanian diacritics render (the @engine/ui font carries them, incl. comma-below ș/ț).
 */
import { masteryTier } from "@mathquest/sim-core";
import type {
  CombatAction,
  EnemyResult,
  Grade,
  LifelineKind,
  Locale,
  MathTopic,
  NodeType,
  PlayerResult,
  StatBonuses,
  TopicMastery,
} from "@mathquest/sim-core";

/** The exact shape every pre-slice-2 `STRINGS` call site relied on — plain labels + formatter fns.
 * `STRINGS_RO`/`STRINGS_EN` both satisfy this; `getStrings(locale)` returns one of the two. */
export interface Strings {
  readonly title: string;

  /** The playable hero's proper name (M5 folklore theming, slice 1) — the classic Făt-Frumos of
   * Romanian folklore. A folklore PROPER NAME, so it stays IDENTICAL in both locales (mirrors
   * `@mathquest/sim-core/run/enemies.ts`'s "names are the theme, not translated" rule). */
  readonly heroName: string;

  readonly actionLabel: Record<CombatAction, string>;

  readonly enemyIntentPrefix: string;
  readonly warriorBlockPrefix: string;

  readonly submit: string;
  readonly backspace: string;
  readonly typedPlaceholder: string;

  readonly won: string;
  readonly lost: string;
  readonly restart: string;

  readonly continueLabel: string;
  readonly teachTitle: string;

  readonly gradeLabel: Record<Grade, string>;

  /** The combat screen's READ-ONLY class line (the fight's difficulty came from the chosen map
   * node — `ui/map-screen.ts` — not a mid-fight selector). */
  gradeReadout(grade: Grade): string;

  turnLabel(turn: number): string;

  /** The PLAYER's own result-cue line, rendered from `CombatSnapshot.lastPlayer`. Kept on its OWN
   * line — separate from `enemyResultCue` — so it is never overwritten by the enemy's hit. */
  playerResultCue(last: PlayerResult): string;

  /** The ENEMY's result-cue line, rendered from `CombatSnapshot.lastEnemy`. */
  enemyResultCue(last: EnemyResult, enemyName: string): string;

  // --- map screen ------------------------------------------------------------------------------

  readonly mapTitle: string;
  readonly warriorHpLabel: string;

  /** The four zone banners along the horizontal journey, indexed by zone (left→right). The last is
   * the boss zone. Purely cosmetic (see `ui/map-screen.ts`'s `ZONES`). */
  readonly zoneName: readonly string[];

  /** A map node's one-line label (glyph + class) — currently unused by any screen (kept for parity
   * with the pre-slice-2 `STRINGS` shape; a future text-fallback legend may use it). */
  nodeLabel(type: NodeType, grade: Grade): string;

  /** Prefixed onto an already-visited node so a cleared node reads differently. */
  readonly visitedPrefix: string;

  readonly legendTitle: string;
  readonly legendLabel: Record<NodeType, string>;

  // --- run-over screen ------------------------------------------------------------------------

  readonly runWon: string;
  readonly runLost: string;
  readonly newRun: string;

  runSummary(nodes: number, hp: number, maxHp: number): string;

  // --- M4a: level-up screen ---------------------------------------------------------------------

  readonly levelUpTitle: string;

  // --- M4a: loot screen --------------------------------------------------------------------------

  readonly lootTitle: string;
  readonly lootSkip: string;

  // --- M4a: stat bonuses (loot item cards + the map HUD's readout) -------------------------------

  readonly statLabel: Record<keyof StatBonuses, string>;

  /** "+2 Atac, +3 Blocaj" (RO) / "+2 Attack, +3 Block" (EN) style summary of every non-zero stat
   * in a (possibly partial) bonus object, in a FIXED atk/maxHp/block/heal order — used by loot
   * item cards AND the map HUD's stat readout (`ui/map-screen.ts`'s `drawChrome`). Empty string
   * when every stat is 0/absent. */
  bonusSummary(bonus: Partial<StatBonuses>): string;

  // --- M4a: map HUD progression readout ------------------------------------------------------------

  levelLabel(level: number): string;
  xpLabel(xp: number, xpNext: number): string;

  // --- M4b: lifelines (hint / 50-50 / skip) -------------------------------------------------------

  readonly lifelineName: Record<LifelineKind, string>;

  /** A lifeline button's label, e.g. "Indiciu (1)" — `ui/combat-screen.ts`'s lifeline bar. */
  lifelineLabel(kind: LifelineKind, n: number): string;

  readonly hintPrefix: string;

  /** "+2 Indiciu" style summary of a loot item's lifeline grant — `ui/loot-screen.ts`'s card, so a
   * pure-lifeline item (empty `bonus`) isn't left with a blank line. `undefined` (no grant) -> "". */
  lifelineSummary(lifeline: { readonly kind: LifelineKind; readonly charges: number } | undefined): string;

  // --- M4c: persistent per-topic mastery -----------------------------------------------------------

  readonly topicName: Record<MathTopic, string>;

  /** One line per topic for the run-over screen's mastery readout, e.g. "Adunare: 12/15 · Nivel 2". */
  masteryLine(topic: MathTopic, m: TopicMastery): string;

  /** The map HUD's compact overall-mastery readout, e.g. "Măiestrie: 5/12" (`sum` is
   * `overallMasteryTier(store)`, out of a fixed max of 12 — 4 topics × tier 3). */
  masteryHudLabel(sum: number): string;

  // --- M5 slice 2: the locale toggle's HUD indicator (corpus/todos/2026-07-23-mathquest-M5-i18n-
  // toggle.md) --------------------------------------------------------------------------------------

  /** The fixed two-letter code shown per language in the map HUD's clickable "RO | EN" indicator
   * — IDENTICAL in both `STRINGS_RO`/`STRINGS_EN` (a language CODE, like a unit abbreviation, is
   * not itself translated — it names the OTHER bundle just as much as the current one). Routed
   * through `Strings` anyway (never a raw literal in `ui/map-screen.ts`) per the "no inline
   * user-facing string literal outside the i18n bundles" rule. */
  readonly languageCode: Record<Locale, string>;

  /** A short note that toggling the language restarts the CURRENT run's position (progress/
   * mastery is preserved — see `@mathquest/sim-core/i18n.ts`'s module doc) — shown near the HUD
   * locale toggle. */
  readonly localeSwitchNote: string;
}

export const STRINGS_RO: Strings = {
  title: "MateQuest — Cetatea Cifrelor",

  heroName: "Făt-Frumos",

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

  gradeReadout(grade: Grade): string {
    return `Clasa: ${STRINGS_RO.gradeLabel[grade]}`;
  },

  turnLabel: (turn: number): string => `Tura ${turn}`,

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

  mapTitle: "Alege-ți drumul",
  warriorHpLabel: "Războinic",

  zoneName: ["Pădurea Adâncă", "Satul", "Munții Carpați", "Bârlogul Zmeului"] as const,

  nodeLabel(type: NodeType, grade: Grade): string {
    switch (type) {
      case "combat":
        return `† ${STRINGS_RO.gradeLabel[grade]}`;
      case "elite":
        return `★ Elită ${STRINGS_RO.gradeLabel[grade]}`;
      case "rest":
        return `♥ Odihnă`;
      case "boss":
        return `♠ Boss ${STRINGS_RO.gradeLabel[grade]}`;
    }
  },

  visitedPrefix: "✓",

  legendTitle: "Legendă:",
  legendLabel: {
    combat: "Luptă",
    elite: "Elită (greu)",
    rest: "Odihnă (vindecă)",
    boss: "Boss",
  } satisfies Record<NodeType, string>,

  runWon: "Ai învins!",
  runLost: "Ai pierdut",
  newRun: "Rulare nouă",

  runSummary(nodes: number, hp: number, maxHp: number): string {
    return `${nodes} noduri vizitate — PS Războinic: ${hp}/${maxHp}`;
  },

  levelUpTitle: "Ai avansat!",

  lootTitle: "Pradă!",
  lootSkip: "Sari peste",

  statLabel: {
    atk: "Atac",
    maxHp: "PS",
    block: "Blocaj",
    heal: "Vindecare",
  } satisfies Record<keyof StatBonuses, string>,

  bonusSummary(bonus: Partial<StatBonuses>): string {
    const parts: string[] = [];
    if ((bonus.atk ?? 0) !== 0) parts.push(`+${bonus.atk} ${STRINGS_RO.statLabel.atk}`);
    if ((bonus.maxHp ?? 0) !== 0) parts.push(`+${bonus.maxHp} ${STRINGS_RO.statLabel.maxHp}`);
    if ((bonus.block ?? 0) !== 0) parts.push(`+${bonus.block} ${STRINGS_RO.statLabel.block}`);
    if ((bonus.heal ?? 0) !== 0) parts.push(`+${bonus.heal} ${STRINGS_RO.statLabel.heal}`);
    return parts.join(", ");
  },

  levelLabel(level: number): string {
    return `Nivel ${level}`;
  },
  xpLabel(xp: number, xpNext: number): string {
    return `XP ${xp}/${xpNext}`;
  },

  lifelineName: {
    hint: "Indiciu",
    fifty: "50-50",
    skip: "Sări",
  } satisfies Record<LifelineKind, string>,

  lifelineLabel(kind: LifelineKind, n: number): string {
    return `${STRINGS_RO.lifelineName[kind]} (${n})`;
  },

  hintPrefix: "Indiciu:",

  lifelineSummary(lifeline: { readonly kind: LifelineKind; readonly charges: number } | undefined): string {
    if (lifeline === undefined) return "";
    return `+${lifeline.charges} ${STRINGS_RO.lifelineName[lifeline.kind]}`;
  },

  topicName: {
    addition: "Adunare",
    subtraction: "Scădere",
    multiplication: "Înmulțire",
    comparison: "Comparare",
  } satisfies Record<MathTopic, string>,

  masteryLine(topic: MathTopic, m: TopicMastery): string {
    return `${STRINGS_RO.topicName[topic]}: ${m.correct}/${m.attempts} · Nivel ${masteryTier(m.correct)}`;
  },

  masteryHudLabel(sum: number): string {
    return `Măiestrie: ${sum}/12`;
  },

  languageCode: { ro: "RO", en: "EN" } satisfies Record<Locale, string>,

  localeSwitchNote: "Schimbarea limbii repornește drumul curent (progresul e păstrat)",
};

export const STRINGS_EN: Strings = {
  title: "MateQuest — Citadel of Numbers",

  // Folklore PROPER NAME — stays identical across locales (see the Strings.heroName doc).
  heroName: "Făt-Frumos",

  actionLabel: {
    attack: "Attack",
    heal: "Heal",
    shield: "Shield",
  } satisfies Record<CombatAction, string>,

  enemyIntentPrefix: "†",
  warriorBlockPrefix: "◆",

  submit: "Submit",
  backspace: "←",
  typedPlaceholder: "?",

  won: "Victory!",
  lost: "Defeat",
  restart: "Again",

  continueLabel: "Continue",
  teachTitle: "Learn:",

  gradeLabel: {
    1: "I",
    2: "II",
    3: "III",
    4: "IV",
  } satisfies Record<Grade, string>,

  gradeReadout(grade: Grade): string {
    return `Grade: ${STRINGS_EN.gradeLabel[grade]}`;
  },

  turnLabel: (turn: number): string => `Turn ${turn}`,

  playerResultCue(last: PlayerResult): string {
    switch (last.kind) {
      case "none":
        return "";
      case "landed": {
        if (last.action === "attack") return `Hit! -${last.amount}`;
        if (last.action === "heal") return `Healed! +${last.amount}`;
        return `Shield! +${last.amount} block`;
      }
      case "fizzle":
        return "Missed!";
    }
  },

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

  mapTitle: "Choose your path",
  warriorHpLabel: "Warrior",

  zoneName: ["Deep Forest", "The Village", "Carpathian Peaks", "The Dragon's Lair"] as const,

  nodeLabel(type: NodeType, grade: Grade): string {
    switch (type) {
      case "combat":
        return `† ${STRINGS_EN.gradeLabel[grade]}`;
      case "elite":
        return `★ Elite ${STRINGS_EN.gradeLabel[grade]}`;
      case "rest":
        return `♥ Rest`;
      case "boss":
        return `♠ Boss ${STRINGS_EN.gradeLabel[grade]}`;
    }
  },

  visitedPrefix: "✓",

  legendTitle: "Legend:",
  legendLabel: {
    combat: "Fight",
    elite: "Elite (hard)",
    rest: "Rest (heals)",
    boss: "Boss",
  } satisfies Record<NodeType, string>,

  runWon: "You won!",
  runLost: "You lost",
  newRun: "New run",

  runSummary(nodes: number, hp: number, maxHp: number): string {
    return `${nodes} nodes visited — Warrior HP: ${hp}/${maxHp}`;
  },

  levelUpTitle: "Level up!",

  lootTitle: "Loot!",
  lootSkip: "Skip",

  statLabel: {
    atk: "Attack",
    maxHp: "HP",
    block: "Block",
    heal: "Heal",
  } satisfies Record<keyof StatBonuses, string>,

  bonusSummary(bonus: Partial<StatBonuses>): string {
    const parts: string[] = [];
    if ((bonus.atk ?? 0) !== 0) parts.push(`+${bonus.atk} ${STRINGS_EN.statLabel.atk}`);
    if ((bonus.maxHp ?? 0) !== 0) parts.push(`+${bonus.maxHp} ${STRINGS_EN.statLabel.maxHp}`);
    if ((bonus.block ?? 0) !== 0) parts.push(`+${bonus.block} ${STRINGS_EN.statLabel.block}`);
    if ((bonus.heal ?? 0) !== 0) parts.push(`+${bonus.heal} ${STRINGS_EN.statLabel.heal}`);
    return parts.join(", ");
  },

  levelLabel(level: number): string {
    return `Level ${level}`;
  },
  xpLabel(xp: number, xpNext: number): string {
    return `XP ${xp}/${xpNext}`;
  },

  lifelineName: {
    hint: "Hint",
    fifty: "50-50",
    skip: "Skip",
  } satisfies Record<LifelineKind, string>,

  lifelineLabel(kind: LifelineKind, n: number): string {
    return `${STRINGS_EN.lifelineName[kind]} (${n})`;
  },

  hintPrefix: "Hint:",

  lifelineSummary(lifeline: { readonly kind: LifelineKind; readonly charges: number } | undefined): string {
    if (lifeline === undefined) return "";
    return `+${lifeline.charges} ${STRINGS_EN.lifelineName[lifeline.kind]}`;
  },

  topicName: {
    addition: "Addition",
    subtraction: "Subtraction",
    multiplication: "Multiplication",
    comparison: "Comparison",
  } satisfies Record<MathTopic, string>,

  masteryLine(topic: MathTopic, m: TopicMastery): string {
    return `${STRINGS_EN.topicName[topic]}: ${m.correct}/${m.attempts} · Level ${masteryTier(m.correct)}`;
  },

  masteryHudLabel(sum: number): string {
    return `Mastery: ${sum}/12`;
  },

  languageCode: { ro: "RO", en: "EN" } satisfies Record<Locale, string>,

  localeSwitchNote: "Switching language restarts the current run (progress is kept)",
};

/** Picks `STRINGS_RO`/`STRINGS_EN` by `locale` — mirrors `@mathquest/sim-core`'s `parseLocale`'s
 * "validate-or-default" story: anything other than the exact `"en"` literal (including an absent
 * argument) resolves to `STRINGS_RO` (Romanian is the DEFAULT). */
export function getStrings(locale?: Locale): Strings {
  return locale === "en" ? STRINGS_EN : STRINGS_RO;
}
