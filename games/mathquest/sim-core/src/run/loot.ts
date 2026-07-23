/**
 * MateQuest M4a — loot/equipment (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md). A
 * small authored item pool granting flat `StatBonuses` — no lifelines yet (M4b) and nothing
 * persists past the run (M4c). RO item names live here (sim-side content, like a generator's
 * `prompt`/`teach` text), matching `combat/generators.ts`'s convention.
 *
 * Determinism (root CLAUDE.md): `rollLoot` consumes ONLY the `Rng` it's handed — the driver forks
 * a named child (`rng.fork("loot")`) before calling it — never `Math.random()`/`Date.now()`.
 *
 * M4b (corpus/todos/2026-07-23-mathquest-M4b-lifelines.md) adds an OPTIONAL `lifeline` grant to
 * `Item`/`ItemView` — a pure-lifeline item carries `bonus: {}` and a `lifeline` field instead
 * (three such items added to the pools below). `lifeline` is display-relevant (the loot card
 * shows it), so `toItemView` copies it through verbatim — it is not a secret like `Problem.answer`.
 *
 * M4c (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md) adds an OPTIONAL `extraPool`
 * parameter to `rollLoot` (default `[]`, so every pre-M4c call site/test stays byte-identical):
 * blueprint items unlocked by the persistent `MasteryStore` (`run/mastery.ts`'s
 * `blueprintItemsFor`) join the BETTER pool for the draw, so higher mastery -> better future loot.
 * This is a fork INPUT change (a bigger pool to draw from), not a fork SEQUENCE change — the same
 * `rng.nextFloat()`-then-`rng.pick()` shape runs regardless of `extraPool`'s size.
 */
import type { Rng } from "@engine/core";
import type { LifelineKind } from "./lifelines";
import type { StatBonuses } from "./progression";

/** A lootable item: a flat, permanent `StatBonuses` delta once taken, and/or (M4b) a lifeline
 * charge grant. A pure-lifeline item has `bonus: {}` and a non-undefined `lifeline`; a pure-stat
 * item (M4a) has no `lifeline` key at all — never assign `lifeline: undefined`
 * (`exactOptionalPropertyTypes`), omit the key instead. */
export interface Item {
  readonly id: string;
  readonly name: string;
  readonly bonus: Partial<StatBonuses>;
  readonly lifeline?: { readonly kind: LifelineKind; readonly charges: number };
}

/** The sim/render-boundary-safe projection of an `Item` — identical shape (an `Item` has no secret
 * fields — `lifeline` is display-relevant, not hidden, unlike `Problem.answer`). Kept as its OWN
 * type mirroring `combat/types.ts`'s `ProblemView` pattern, in case a later milestone needs to
 * strip something here without reshaping every call site. */
export interface ItemView {
  readonly id: string;
  readonly name: string;
  readonly bonus: Partial<StatBonuses>;
  readonly lifeline?: { readonly kind: LifelineKind; readonly charges: number };
}

/** Narrows an `Item` to its boundary-safe `ItemView` — the ONE place this happens (mirrors
 * `combat/combat.ts`'s `toProblemView`). `lifeline` is copied through only when present (an
 * unconditional spread would assign `lifeline: undefined` under `exactOptionalPropertyTypes` when
 * absent — the conditional spread below omits the key entirely instead). */
export function toItemView(item: Item): ItemView {
  return { id: item.id, name: item.name, bonus: item.bonus, ...(item.lifeline !== undefined ? { lifeline: item.lifeline } : {}) };
}

/** Which node type a win came from decides the loot pool's odds. Matches `run/enemies.ts`'s
 * `EnemyKind` shape (every fight-bearing `NodeType` except `"rest"`, which never drops loot). */
export type LootTier = "combat" | "elite" | "boss";

/** ~4 common stat items + 2 common lifeline items (M4b): small, single-stat/single-lifeline grants. */
const COMMON_POOL: readonly Item[] = [
  { id: "sabie-ascutita", name: "Sabie ascuțită", bonus: { atk: 2 } },
  { id: "scut-de-stejar", name: "Scut de stejar", bonus: { block: 3 } },
  { id: "potiune-de-viata", name: "Poțiune de viață", bonus: { maxHp: 6 } },
  { id: "amuleta", name: "Amuletă", bonus: { heal: 2 } },
  { id: "pergament-indicii", name: "Pergament cu indicii", bonus: {}, lifeline: { kind: "hint", charges: 2 } },
  { id: "ochi-ager", name: "Ochi ager", bonus: {}, lifeline: { kind: "fifty", charges: 1 } },
];

/** ~3 better stat items + 1 better lifeline item (M4b, elite/boss-weighted): two-stat bonuses, or
 * a scarcer lifeline grant. */
const BETTER_POOL: readonly Item[] = [
  { id: "coif-de-fier", name: "Coif de fier", bonus: { maxHp: 4, block: 2 } },
  { id: "manusi-de-jar", name: "Mănuși de jar", bonus: { atk: 3, heal: 1 } },
  { id: "talisman-vechi", name: "Talisman vechi", bonus: { block: 2, heal: 2 } },
  { id: "clopotel-fermecat", name: "Clopoțel fermecat", bonus: {}, lifeline: { kind: "skip", charges: 1 } },
];

/** Probability a single draw comes from `BETTER_POOL` rather than `COMMON_POOL`, by tier —
 * elite/boss wins skew markedly toward the better pool; plain combat wins mostly see commons. */
const BETTER_POOL_CHANCE: Record<LootTier, number> = {
  combat: 0.15,
  elite: 0.45,
  boss: 0.6,
};

/** 3 DISTINCT loot offers, deterministic for a given `(rng, tier)`. Draws repeatedly (pool chosen
 * by `tier`'s odds, then one item from that pool) until 3 distinct ids are collected — the
 * combined 7-item pool always has enough room; `guard` is just a defensive cap, never expected to
 * bind. Consumes ONLY `rng` — no forking of its own (the caller already forked a per-roll child,
 * mirroring `run/map.ts`'s leaf draws that call `rng.int`/`rng.pick` directly). */
export function rollLoot(rng: Rng, tier: LootTier, extraPool: readonly Item[] = []): Item[] {
  const betterChance = BETTER_POOL_CHANCE[tier];
  // M4c: unlocked blueprint items widen the BETTER pool only — `BETTER_POOL` itself (the default,
  // extraPool===[]) is reused verbatim (no new array) so pre-M4c behavior is byte-identical.
  const betterPool: readonly Item[] = extraPool.length > 0 ? [...BETTER_POOL, ...extraPool] : BETTER_POOL;
  const chosen: Item[] = [];
  const chosenIds = new Set<string>();
  let guard = 0;
  while (chosen.length < 3 && guard < 200) {
    guard += 1;
    const pool = rng.nextFloat() < betterChance ? betterPool : COMMON_POOL;
    const candidate = rng.pick(pool);
    if (chosenIds.has(candidate.id)) continue;
    chosenIds.add(candidate.id);
    chosen.push(candidate);
  }
  return chosen;
}

/** Folds an item's (possibly multi-stat) bonus into accumulated `StatBonuses` — pure, returns a
 * NEW object. Used both by loot pickup and (indirectly) mirrors `progression.ts`'s upgrade
 * appliers' shape. */
export function foldItemBonus(stats: StatBonuses, bonus: Partial<StatBonuses>): StatBonuses {
  return {
    atk: stats.atk + (bonus.atk ?? 0),
    maxHp: stats.maxHp + (bonus.maxHp ?? 0),
    block: stats.block + (bonus.block ?? 0),
    heal: stats.heal + (bonus.heal ?? 0),
  };
}
