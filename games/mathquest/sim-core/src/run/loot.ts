/**
 * MateQuest M4a — loot/equipment (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md). A
 * small authored item pool granting flat `StatBonuses` — no lifelines yet (M4b) and nothing
 * persists past the run (M4c). RO item names live here (sim-side content, like a generator's
 * `prompt`/`teach` text), matching `combat/generators.ts`'s convention.
 *
 * Determinism (root CLAUDE.md): `rollLoot` consumes ONLY the `Rng` it's handed — the driver forks
 * a named child (`rng.fork("loot")`) before calling it — never `Math.random()`/`Date.now()`.
 */
import type { Rng } from "@engine/core";
import type { StatBonuses } from "./progression";

/** A lootable item: a flat, permanent `StatBonuses` delta once taken. */
export interface Item {
  readonly id: string;
  readonly name: string;
  readonly bonus: Partial<StatBonuses>;
  // M4b: add optional lifeline?: LifelineKind + charges here
}

/** The sim/render-boundary-safe projection of an `Item` — identical shape today (an `Item` has no
 * secret fields yet), kept as its OWN type so a later `lifeline`/`charges` field (M4b) can be
 * stripped here without reshaping every call site (mirrors `combat/types.ts`'s `ProblemView`). */
export interface ItemView {
  readonly id: string;
  readonly name: string;
  readonly bonus: Partial<StatBonuses>;
}

/** Narrows an `Item` to its boundary-safe `ItemView` — the ONE place this happens (mirrors
 * `combat/combat.ts`'s `toProblemView`). */
export function toItemView(item: Item): ItemView {
  return { id: item.id, name: item.name, bonus: item.bonus };
}

/** Which node type a win came from decides the loot pool's odds. Matches `run/enemies.ts`'s
 * `EnemyKind` shape (every fight-bearing `NodeType` except `"rest"`, which never drops loot). */
export type LootTier = "combat" | "elite" | "boss";

/** ~4 common items: small, single-stat bonuses. */
const COMMON_POOL: readonly Item[] = [
  { id: "sabie-ascutita", name: "Sabie ascuțită", bonus: { atk: 2 } },
  { id: "scut-de-stejar", name: "Scut de stejar", bonus: { block: 3 } },
  { id: "potiune-de-viata", name: "Poțiune de viață", bonus: { maxHp: 6 } },
  { id: "amuleta", name: "Amuletă", bonus: { heal: 2 } },
];

/** ~3 better items (elite/boss-weighted): two-stat bonuses. */
const BETTER_POOL: readonly Item[] = [
  { id: "coif-de-fier", name: "Coif de fier", bonus: { maxHp: 4, block: 2 } },
  { id: "manusi-de-jar", name: "Mănuși de jar", bonus: { atk: 3, heal: 1 } },
  { id: "talisman-vechi", name: "Talisman vechi", bonus: { block: 2, heal: 2 } },
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
export function rollLoot(rng: Rng, tier: LootTier): Item[] {
  const betterChance = BETTER_POOL_CHANCE[tier];
  const chosen: Item[] = [];
  const chosenIds = new Set<string>();
  let guard = 0;
  while (chosen.length < 3 && guard < 200) {
    guard += 1;
    const pool = rng.nextFloat() < betterChance ? BETTER_POOL : COMMON_POOL;
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
