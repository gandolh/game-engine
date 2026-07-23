/**
 * MateQuest M3 — enemy archetypes (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part
 * A2). SUPERSEDES the M1/M2 single hardcoded enemy: which archetype a fight uses now depends on
 * the map node's `type` ("combat" | "elite" | "boss" — `run/map.ts`'s `NodeType` minus `"rest"`,
 * which has no fight at all).
 *
 * Balance here is PROVISIONAL/tunable, per the brief's own note — these three rows are the only
 * place fight difficulty-by-enemy lives, so retuning later touches only this file.
 *
 * M5 folklore theming (corpus/todos/2026-07-23-mathquest-M5-folklore-theming.md, slice 1 of 3)
 * adds `enemyFor(kind, zone)`: the map's four zones (`run/map.ts`'s `Zone`) each get their own RO
 * folklore name + epithet for `"combat"`/`"elite"` (the boss ignores zone — there is one boss,
 * always in the lair). This is FLAVOR ONLY — `enemyFor` always composes the zone-flavored
 * name/title onto `ENEMY_ARCHETYPES[kind]`'s EXACT hp/intentBase/intentRoll; balance is LOCKED and
 * untouched by this addition (see `enemies.test.ts`'s exhaustive stat-equality assertion).
 *
 * M5 slice 2 (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md) adds a `locale` parameter to
 * `enemyFor`, defaulting to `"ro"` (every pre-slice-2 call site — including every existing test —
 * is byte-identical). **Folklore proper NAMES stay identical in both locales** (Zmeu, Balaur, Muma
 * Pădurii, Strigoi, Vârcolac, Căpcăun — they are the theme, not translated); only the `title`
 * epithet translates (e.g. "puiul balaurului" → "the dragon's whelp"). `enemyFor` remains a PURE
 * function of `(kind, zone, locale)` — no `Rng`, so determinism is untouched (module doc above).
 */
import type { EnemySprite, Grade } from "../combat/types";
import { DEFAULT_LOCALE, type Locale } from "../i18n";
import type { Zone } from "./map";

/** The three node types a fight can happen at (`"rest"` — `run/map.ts`'s `NodeType` — has none). */
export type EnemyKind = "combat" | "elite" | "boss";

/** An enemy's identity + telegraphed-damage range. `intent = intentBase + rng.int(0, intentRoll)`
 * (see `combat/logic.ts`'s `rollEnemyIntent`). */
export interface EnemyArchetype {
  readonly name: string;
  readonly maxHp: number;
  readonly intentBase: number;
  readonly intentRoll: number;
  /** M5: a short RO folklore epithet shown under the enemy's name (e.g. "puiul balaurului").
   * `ENEMY_ARCHETYPES`'s own entries carry a default (matching their pre-M5 name's zone);
   * `enemyFor` overrides `name`/`title`/`sprite` per the roster below. */
  readonly title: string;
  /** M5 slice 3: which folklore creature the client draws (`@mathquest/client`'s `ui/sprites.ts`).
   * `ENEMY_ARCHETYPES` defaults match the pre-M5 name; `enemyFor` overrides per zone. */
  readonly sprite: EnemySprite;
}

/**
 * Registry of the three M3 enemy archetypes, keyed by `EnemyKind`.
 *
 * Retuned DOWN from the brief's own literal example numbers (combat 24/5-8 unchanged; elite
 * 34hp/7-10; boss 44hp/8-11) — those, combined with the OTHER M1/M2-locked numbers this brief
 * keeps fixed (`ATTACK_DAMAGE=8`, and `WARRIOR_MAX_HP=30` fixed BY THIS BRIEF's own A3: "starts
 * full = 30"), are mathematically unwinnable: killing an enemy takes `ceil(maxHp/8)` attacks, and
 * every one of the `ceil(maxHp/8)-1` NON-lethal attacks draws a full, unblockable return hit (see
 * `combat/combat.ts` — a `"shield"`/`"heal"` turn can't ALSO be the attack that turn, so it adds
 * exposure rather than removing it). At the brief's own numbers the elite alone needs 4 non-lethal
 * hits worst-case 4x10=40 damage, and the boss 5 worst-case 5x11=55 — both exceed the fixed 30 HP
 * cap even from full health in an ISOLATED fight, before any other fight in the run has cost
 * anything. Tuned here so each fight's `(hits-1) * intentRange` stays comfortably under 30 with
 * margin left for the OTHER fights along a run (see `run/map.test.ts`/`sim-bootstrap.test.ts`'s
 * "beating the boss" test, which empirically verifies a full run is winnable at these numbers).
 */
export const ENEMY_ARCHETYPES: Record<EnemyKind, EnemyArchetype> = {
  // A baby Zmeu (Romanian-folklore dragon-adjacent creature) — the M1/M2 enemy, unchanged stats.
  // Default name/title match the zone-0 (forest) roster row below — `enemyFor` overrides per zone.
  combat: { name: "Zmeu pui", maxHp: 24, intentBase: 5, intentRoll: 4, title: "puiul balaurului", sprite: "dragon" }, // intent 5..8; 3 hits, 2 unavoidable (10-16 dmg)
  // A Balaur (a multi-headed dragon of Romanian folklore) — the branching-map "hard branch" fight.
  // Default name/title match the zone-2 (mountains) roster row below — `enemyFor` overrides per zone.
  elite: { name: "Balaur", maxHp: 26, intentBase: 5, intentRoll: 3, title: "balaurul cu multe capete", sprite: "balaur" }, // intent 5..7; 4 hits, 3 unavoidable (15-21 dmg)
  // An elder Zmeu — the run's boss, always grade 4, always in the lair (zone-independent).
  boss: { name: "Zmeu bătrân", maxHp: 32, intentBase: 5, intentRoll: 3, title: "stăpânul bârlogului", sprite: "dragon" }, // intent 5..7; 4 hits, 3 unavoidable (15-21 dmg)
} as const;

/** The boss's fixed fight grade (`run/map.ts`'s `generateMap` also pins the boss node's own
 * `grade` to this — kept as a named constant so the two stay in lockstep). */
export const BOSS_GRADE: Grade = 4;

/**
 * M5 folklore theming — the zone-flavored name+epithet roster for `"combat"`/`"elite"`, keyed by
 * `Zone` (`run/map.ts`). LOCKED per the brief (RO folklore names + short epithets); zone 3 (lair)
 * rows are defined even though the current 6-row map (`map.ts`'s `zoneForRow`) never places a
 * non-boss node there — keeps `enemyFor` TOTAL over all 4 zones, future-proofing a wider map.
 *
 * M5 slice 2 adds an EN epithet column (`titleEn`) alongside the LOCKED RO `title` — the folklore
 * `name` (and `sprite`) stay identical across locales; only the epithet translates (module doc).
 */
const ROSTER: {
  readonly combat: Readonly<
    Record<Zone, readonly [name: string, title: string, titleEn: string, sprite: EnemySprite]>
  >;
  readonly elite: Readonly<
    Record<Zone, readonly [name: string, title: string, titleEn: string, sprite: EnemySprite]>
  >;
} = {
  combat: {
    0: ["Zmeu pui", "puiul balaurului", "the dragon's whelp", "dragon"], // forest
    1: ["Strigoi", "mortul viu", "the walking dead", "strigoi"], // village
    2: ["Căpcăun", "uriașul munților", "giant of the mountains", "capcaun"], // mountains
    3: ["Slugă de Zmeu", "sluga stăpânului", "the master's servant", "dragon"], // lair
  },
  elite: {
    0: ["Muma Pădurii", "vrăjitoarea codrului", "witch of the forest", "muma"], // forest
    1: ["Vârcolac", "fiara lunii", "beast of the moon", "varcolac"], // village
    2: ["Balaur", "balaurul cu multe capete", "the many-headed dragon", "balaur"], // mountains
    3: ["Zmeu", "zmeul din bârlog", "the dragon of the lair", "dragon"], // lair
  },
};

/** The boss's EN epithet — RO "stăpânul bârlogului" → EN "lord of the lair" (name "Zmeu bătrân"
 * stays identical, see the module doc). */
const BOSS_TITLE_EN = "lord of the lair";

/**
 * Composes a zone-flavored `name`/`title` onto `ENEMY_ARCHETYPES[kind]`'s EXACT stats — a PURE
 * function of `(kind, zone, locale)`, no `Rng` involved, so the same `(kind, zone, locale)` always
 * returns the same archetype (determinism is load-bearing — see the module doc). The boss ignores
 * `zone` (there is one boss, always in the lair) but the function stays total: every
 * `(kind, zone, locale)` triple returns a value, including boss's eight (per-locale-identical)
 * results. `locale` defaults to `"ro"` — every pre-slice-2 call site is unchanged.
 */
export function enemyFor(kind: EnemyKind, zone: Zone, locale: Locale = DEFAULT_LOCALE): EnemyArchetype {
  const base = ENEMY_ARCHETYPES[kind];
  if (kind === "boss") {
    // One boss, always "Zmeu bătrân" — zone-independent; only its epithet translates.
    return locale === "en" ? { ...base, title: BOSS_TITLE_EN } : base;
  }
  const [name, titleRo, titleEn, sprite] = ROSTER[kind][zone];
  return { ...base, name, title: locale === "en" ? titleEn : titleRo, sprite };
}
