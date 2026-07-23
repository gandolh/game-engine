/**
 * MateQuest M4c — persistent per-topic mastery (corpus/todos/2026-07-23-mathquest-M4c-persistent-
 * mastery.md). The game's FIRST cross-run persistence: a per-topic mastery meter that SURVIVES
 * death, gates the map's hard ("elite") branch, and unlocks gear blueprints once a topic is well
 * enough practiced.
 *
 * **Ownership seam (the load-bearing architecture fact — see the brief's opening section): the sim
 * runs in a Web Worker, which has NO access to `localStorage`.** This module is pure sim-core: it
 * NEVER touches `localStorage`/DOM. The MAIN THREAD (`client/src/main.ts`) owns persistence — it
 * reads `localStorage[MASTERY_STORAGE_KEY]`, calls `parseMasteryStore` (pure, safe on any input),
 * hands the resulting `MasteryStore` into the worker on `init`, and writes it back whenever a
 * snapshot's `RunView.mastery` changes. `sim-bootstrap.ts` is the ONLY place that MUTATES a
 * `MasteryStore` (via `foldTopicOutcomes`, on every fight end) — everything in THIS module is pure.
 *
 * Determinism (root CLAUDE.md): every function here is a pure fold over its arguments — no
 * `Rng`/`Math.random()`/`Date.now()`. Mastery becomes part of the sim's determinism contract as a
 * FORK INPUT, not a new fork: `sim-bootstrap.ts` feeds `overallMasteryTier(store) >= ELITE_UNLOCK_TIER`
 * into `run/map.ts`'s `generateMap` (the elite gate) and `blueprintItemsFor(store.blueprints)` into
 * `run/loot.ts`'s `rollLoot` (the loot pool) — the existing `map`/`run:${n}`/`node:${id}`/`levelup`/
 * `loot`/combat's own forks are consumed in the exact same order regardless of mastery.
 */
import type { MathTopic } from "../combat/types";
import type { Item } from "./loot";

/** Lifetime correct/attempted solve counts for ONE topic. Never decreases — mastery is a ratchet,
 * even across a run-ending loss (see `sim-bootstrap.ts`'s `resolveCombatIfOver`). */
export interface TopicMastery {
  readonly correct: number;
  readonly attempts: number;
}

/** The persisted, cross-run store. `topics` ALWAYS carries all 4 `MathTopic`s (never a partial
 * record) — `parseMasteryStore` enforces this on load, and every fold here preserves it. */
export interface MasteryStore {
  readonly version: number;
  readonly topics: Record<MathTopic, TopicMastery>;
  /** Unlocked blueprint ids (see `BLUEPRINTS`), always deduped + sorted — a stable, comparable
   * serialization (load-bearing for the "idempotent on refold" + persistence round-trip tests). */
  readonly blueprints: readonly string[];
}

/** Bumped only if the STORED SHAPE ever changes incompatibly; `parseMasteryStore` resets to
 * `EMPTY_MASTERY_STORE` on any mismatch (validate-or-reset — the only migration story for v1, per
 * the brief). */
export const MASTERY_STORE_VERSION = 1;

/** The single `localStorage` key the main thread reads/writes (`client/src/main.ts`) — the sim/
 * worker never references this constant for an actual storage call, only for round-tripping it
 * through `init`/snapshots. */
export const MASTERY_STORAGE_KEY = "mathquest.mastery.v1";

/** All 4 M2 topics, in a fixed, stable order — used everywhere a topic needs to be enumerated
 * (folding, parsing, `overallMasteryTier`, `blueprintItemsFor`). */
const ALL_TOPICS: readonly MathTopic[] = ["addition", "subtraction", "multiplication", "comparison"];

const ZERO_TOPIC: TopicMastery = { correct: 0, attempts: 0 };

/** The fresh-install / private-mode-storage / corrupt-save fallback — a brand-new player has
 * earned nothing yet, so `overallMasteryTier` is 0 and the elite gate starts CLOSED (see
 * `ELITE_UNLOCK_TIER`). */
export const EMPTY_MASTERY_STORE: MasteryStore = {
  version: MASTERY_STORE_VERSION,
  topics: {
    addition: ZERO_TOPIC,
    subtraction: ZERO_TOPIC,
    multiplication: ZERO_TOPIC,
    comparison: ZERO_TOPIC,
  },
  blueprints: [],
};

/** Lifetime-correct-count thresholds a topic crosses to reach tier 1/2/3 (LOCKED, brief). */
export const MASTERY_TIER_THRESHOLDS = [5, 15, 30] as const;

/** A single topic's tier: 0 below 5 correct, 1 at >=5, 2 at >=15, 3 at >=30. Pure integer step
 * function of lifetime `correct` — `attempts` never factors in (that's `masteryPct`, display-only). */
export function masteryTier(correct: number): 0 | 1 | 2 | 3 {
  if (correct >= MASTERY_TIER_THRESHOLDS[2]) return 3;
  if (correct >= MASTERY_TIER_THRESHOLDS[1]) return 2;
  if (correct >= MASTERY_TIER_THRESHOLDS[0]) return 1;
  return 0;
}

/** Accuracy for DISPLAY only (never gates anything) — 0 when nothing has been attempted yet, so a
 * fresh topic reads as 0% rather than NaN/Infinity. */
export function masteryPct(m: TopicMastery): number {
  return m.attempts > 0 ? m.correct / m.attempts : 0;
}

/** Sum of `masteryTier` over all 4 topics (range 0..12) — the single number the elite gate + the
 * map HUD's compact readout key off. */
export function overallMasteryTier(store: MasteryStore): number {
  let sum = 0;
  for (const topic of ALL_TOPICS) sum += masteryTier(store.topics[topic].correct);
  return sum;
}

/** `overallMasteryTier(store) >= ELITE_UNLOCK_TIER` unlocks the map's hard ("elite") branch — see
 * `run/map.ts`'s `generateMap` `eliteUnlocked` option and `sim-bootstrap.ts`'s two call sites. A
 * fresh player (empty store, overall 0) starts with NO elite until they've earned ~2 tiers total. */
export const ELITE_UNLOCK_TIER = 2;

/** ONE gear blueprint per topic, unlocked the instant that topic reaches tier 2 (>=15 correct) —
 * see `foldTopicOutcomes`. Each item is meaningfully better than anything in `run/loot.ts`'s base
 * `COMMON_POOL`/`BETTER_POOL` (a deliberate "practice this topic -> real power" payoff), and each
 * topic's reward is a DISTINCT flavor: a straight two-stat weapon (addition), a tankier two-stat
 * set (subtraction), the strongest two-stat weapon (multiplication), and a lifeline-granting item
 * (comparison) so mastering the concept-only topic pays off even for a player who never leans on
 * raw stat bonuses. */
export const BLUEPRINTS: Record<MathTopic, { readonly id: string; readonly item: Item }> = {
  addition: {
    id: "bp-adunare",
    item: { id: "sabie-de-maestru", name: "Sabie de maestru", nameEn: "Master's Sword", bonus: { atk: 4 } },
  },
  subtraction: {
    id: "bp-scadere",
    item: { id: "platosa-de-fier", name: "Platoșă de fier", nameEn: "Iron Plate", bonus: { block: 4, maxHp: 4 } },
  },
  multiplication: {
    id: "bp-inmultire",
    item: { id: "ciocan-de-razboi", name: "Ciocan de război", nameEn: "War Hammer", bonus: { atk: 4, heal: 3 } },
  },
  comparison: {
    id: "bp-comparare",
    item: {
      id: "ochelarii-intelepciunii",
      name: "Ochelarii înțelepciunii",
      nameEn: "Spectacles of Wisdom",
      bonus: {},
      lifeline: { kind: "hint", charges: 3 },
    },
  },
};

/** Maps unlocked blueprint ids -> their `Item`, ignoring any unknown id defensively (a future
 * schema change removing/renaming a blueprint should never crash an old save's replay). Order
 * follows `blueprints`'s own (already deduped+sorted) order. */
export function blueprintItemsFor(blueprints: readonly string[]): Item[] {
  const byId = new Map(ALL_TOPICS.map((topic) => [BLUEPRINTS[topic].id, BLUEPRINTS[topic].item] as const));
  const items: Item[] = [];
  for (const id of blueprints) {
    const item = byId.get(id);
    if (item !== undefined) items.push(item);
  }
  return items;
}

/** Folds ONE fight's per-topic `{correct, attempts}` deltas into `store`, then recomputes unlocked
 * blueprints — pure, returns a NEW `MasteryStore`, never mutates either argument. Idempotent to
 * refold the SAME already-unlocked blueprint id again (a `Set` dedupes before sorting). */
export function foldTopicOutcomes(store: MasteryStore, outcomes: Record<MathTopic, TopicMastery>): MasteryStore {
  const topics: Record<MathTopic, TopicMastery> = {
    addition: ZERO_TOPIC,
    subtraction: ZERO_TOPIC,
    multiplication: ZERO_TOPIC,
    comparison: ZERO_TOPIC,
  };
  for (const topic of ALL_TOPICS) {
    const prev = store.topics[topic];
    const delta = outcomes[topic];
    topics[topic] = { correct: prev.correct + delta.correct, attempts: prev.attempts + delta.attempts };
  }

  const unlocked = new Set(store.blueprints);
  for (const topic of ALL_TOPICS) {
    if (masteryTier(topics[topic].correct) >= 2) unlocked.add(BLUEPRINTS[topic].id);
  }

  return { version: store.version, topics, blueprints: [...unlocked].sort() };
}

/** Parses a `localStorage`-read string into a `MasteryStore` — the ONLY place raw persisted JSON
 * is trusted, and the v1 migration story ("validate-or-reset", per the brief): `null`, a JSON
 * parse error, a version mismatch, or ANY shape violation (a missing/malformed topic, or
 * `blueprints` not being an array) resets to `EMPTY_MASTERY_STORE` wholesale rather than limping
 * along with a partially-trusted object — that empty store already satisfies "all 4 topics
 * present, filled with {0,0}". On a genuinely well-shaped store, `blueprints` is still normalized
 * (deduped + sorted) even though the writer (this module's own `foldTopicOutcomes`) already keeps
 * it that way — defensive against a hand-edited or future-writer save. */
export function parseMasteryStore(raw: string | null): MasteryStore {
  if (raw === null) return EMPTY_MASTERY_STORE;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_MASTERY_STORE;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return EMPTY_MASTERY_STORE;
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== MASTERY_STORE_VERSION) return EMPTY_MASTERY_STORE;

  const rawTopics = obj.topics;
  if (typeof rawTopics !== "object" || rawTopics === null || Array.isArray(rawTopics)) return EMPTY_MASTERY_STORE;
  const topicsObj = rawTopics as Record<string, unknown>;

  const topics: Record<MathTopic, TopicMastery> = {
    addition: ZERO_TOPIC,
    subtraction: ZERO_TOPIC,
    multiplication: ZERO_TOPIC,
    comparison: ZERO_TOPIC,
  };
  for (const topic of ALL_TOPICS) {
    const t = topicsObj[topic];
    if (typeof t !== "object" || t === null || Array.isArray(t)) return EMPTY_MASTERY_STORE;
    const tObj = t as Record<string, unknown>;
    const correct = tObj.correct;
    const attempts = tObj.attempts;
    if (typeof correct !== "number" || !Number.isFinite(correct)) return EMPTY_MASTERY_STORE;
    if (typeof attempts !== "number" || !Number.isFinite(attempts)) return EMPTY_MASTERY_STORE;
    topics[topic] = { correct, attempts };
  }

  const rawBlueprints = obj.blueprints;
  if (!Array.isArray(rawBlueprints)) return EMPTY_MASTERY_STORE;
  const blueprints = [...new Set(rawBlueprints.filter((b): b is string => typeof b === "string"))].sort();

  return { version: MASTERY_STORE_VERSION, topics, blueprints };
}
