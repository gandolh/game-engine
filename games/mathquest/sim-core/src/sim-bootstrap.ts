/**
 * MateQuest sim bootstrap — the deterministic RUN model (a branching node map of fights,
 * warrior HP persisting across them; see corpus/wiki/mathquest-overview.md).
 *
 * M1 (corpus/todos/2026-07-21-mathquest-M1-combat-loop.md) built the combat loop around a single
 * hardcoded fight. M2 (corpus/todos/2026-07-22-mathquest-M2-problem-generators.md) added the real
 * problem-generator seam. M3 (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md) wraps that
 * combat loop in a RUN: this file no longer owns a fight's internals directly — `combat/combat.ts`
 * (extracted, `createCombat`) does — it owns the branching `RunMap` (`run/map.ts`), which node the
 * player currently can/has reached, and warriorHp persisting across fights. M4a
 * (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md) adds in-run XP/level-up and
 * loot/equipment stat bonuses, both resetting per run — see `proceed()` below for the exact
 * win → (level_up)* → (loot | run_won) → map sequencing. `bootstrapMathquestSim` keeps its
 * M0-M3 signature/shape (still hands back `world`/`scheduler`/`rng`/`step()`), so it stays usable
 * from:
 *   - a headless test, driving `chooseNode`/`chooseAction`/`submitAnswer`/`acknowledgeTeach`/
 *     `chooseLevelUp`/`chooseLoot`/`newRun` directly (this package's own `sim-bootstrap.test.ts`);
 *   - a browser Web Worker (`@mathquest/client`'s `src/worker/sim-worker.ts`), which paces
 *     `step()` on a wall-clock `setInterval` — pacing only. Run/combat state changes ONLY inside
 *     the commands below, never inside `step()`, so a run's outcome depends solely on the
 *     (seed, command sequence) pair, never on wall-clock timing (determinism is load-bearing;
 *     see root CLAUDE.md's "Architecture essentials").
 *
 * No ECS gameplay (no entities to query/despawn) — `world`/`scheduler` are kept, empty, purely
 * for shape-compatibility with every other game's sim-core bootstrap and so a later milestone
 * (persistence, mastery) has somewhere to hang systems without reshaping this file's return type.
 *
 * Determinism: ALL randomness flows through the seeded `rng` (`createRng`, `@engine/core`)
 * forked per named label — `rng.fork("map")` for the FIRST run's map, `rng.fork(`run:${n}`)` for
 * every `newRun()` after, `rng.fork(`node:${id}`)` for the child `Rng` handed to `createCombat`
 * at each chosen fight, `rng.fork("levelup")`/`rng.fork("loot")` (M4a, new — added AFTER those
 * three, never reordering them) for each level-up/loot offer roll — never
 * `Math.random()`/`Date.now()`. `Rng.fork` consumes a parent draw, so the ORDER these forks
 * happen in must stay identical run-to-run for the same command script (it does — see
 * `chooseNode`/`newRun`/`proceed` below). M4b (corpus/todos/2026-07-23-mathquest-M4b-lifelines.md)
 * adds NO new fork here — `useLifeline` forwards straight to `Combat.useLifeline`, which forks
 * `"fifty"` on the fight's OWN rng (never a driver-level fork), so the driver-level fork order
 * (`map`/`run:${n}`/`node:${id}`/`levelup`/`loot`) is completely unchanged.
 *
 * M4c (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md) adds the game's FIRST
 * cross-run persistence: a per-topic `MasteryStore` (`run/mastery.ts`), ferried in via
 * `MathquestSimOptions.mastery` (default `EMPTY_MASTERY_STORE`) and echoed out on every
 * `RunView.mastery`. Adds NO new fork either — mastery only changes fork INPUTS
 * (`generateMap`'s `eliteUnlocked`, `rollLoot`'s `extraPool`), never the fork sequence. Unlike
 * every other run-scoped field, `masteryStore` is NOT reset by `newRun()` — it is the one piece of
 * state that survives death (see `resolveCombatIfOver`, which folds it on EVERY fight end, win or
 * loss). **This module never touches `localStorage`/DOM** — the sim runs in a Web Worker, which
 * has no such access; persistence is owned entirely by the main thread (`client/src/main.ts`),
 * which reads/writes `localStorage` and only ever hands this module a plain `MasteryStore` value.
 *
 * M5 slice 2 (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md) adds `MathquestSimOptions.locale`
 * (default `"ro"`, see `./i18n`) — the LOCKED architecture is "the sim is locale-aware via an init
 * option", exactly like `seed`/`mastery`. `locale` is captured ONCE into this closure's state (never
 * changes during a run — the client re-inits the WHOLE sim to switch languages, see `./i18n`'s
 * module doc) and threaded to the two places this module produces user-facing text:
 * `enemyFor(node.type, node.zone, locale)` in `chooseNode`, and `createCombat({..., locale})`
 * (which forwards it to the generators). Adds NO new fork — `locale` only changes which WORDS a
 * generator/`enemyFor` emits, never an `Rng` draw (determinism — root CLAUDE.md, `./i18n`'s doc).
 */
import { World, Scheduler, createRng, type Rng, type System, type SimContext } from "@engine/core";
import { createCombat, type Combat } from "./combat/combat";
import { WARRIOR_MAX_HP } from "./combat/constants";
import type { AnswerResponse, CombatAction, CombatSnapshot } from "./combat/types";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { enemyFor } from "./run/enemies";
import { generateMap, type MapNode, type NodeType, type RunMap } from "./run/map";
import { REST_HEAL } from "./run/constants";
import { rollLoot, toItemView, foldItemBonus, type Item, type ItemView, type LootTier } from "./run/loot";
import { STARTING_LIFELINES, type LifelineCharges, type LifelineKind } from "./run/lifelines";
import {
  blueprintItemsFor,
  foldTopicOutcomes,
  overallMasteryTier,
  ELITE_UNLOCK_TIER,
  EMPTY_MASTERY_STORE,
  type MasteryStore,
} from "./run/mastery";
import {
  describeUpgrade,
  offerUpgrades,
  xpToNext,
  UPGRADES,
  ZERO_STATS,
  type StatBonuses,
  type UpgradeKind,
  type UpgradeOffer,
} from "./run/progression";

export type {
  AnswerResponse,
  ChoiceProblem,
  CombatAction,
  CombatPhase,
  CombatSnapshot,
  CombatantView,
  EnemyResult,
  EnemySprite,
  EnemyView,
  Grade,
  MathTopic,
  PlayerResult,
  Problem,
  ProblemKind,
  ProblemView,
  TypedProblem,
} from "./combat/types";
export type { EnemyArchetype, EnemyKind } from "./run/enemies";
export type { MapNode, NodeType, RunMap, Zone } from "./run/map";
export type { Item, ItemView, LootTier } from "./run/loot";
export type { LifelineCharges, LifelineKind } from "./run/lifelines";
export type { MasteryStore, TopicMastery } from "./run/mastery";
export { MASTERY_STORAGE_KEY, parseMasteryStore, EMPTY_MASTERY_STORE } from "./run/mastery";
export type { StatBonuses, UpgradeKind, UpgradeOffer } from "./run/progression";
export type { Locale } from "./i18n";
export { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, parseLocale } from "./i18n";

/**
 * MateQuest's entity shape. No entities are spawned yet (the run/combat model is plain
 * closed-over state, not ECS) — this exists only so `World<MathquestEntity>` has a concrete
 * generic, matching every other game's sim-core (and ready for a later milestone's loot/mastery
 * entities without a breaking rename).
 */
export interface MathquestEntity {
  id?: number;
  [key: string]: unknown;
}

export interface MathquestSimOptions {
  /** Seed for the sim's root `Rng` — all future randomness must fork from this (never `Math.random()`). */
  seed: number;
  /** M4c: the persistent per-topic mastery store, ferried in by the main thread (read from
   * `localStorage`, see `run/mastery.ts`'s module doc) — the sim itself never touches storage.
   * Defaults to `EMPTY_MASTERY_STORE` so every pre-M4c call site/test stays byte-identical. */
  mastery?: MasteryStore;
  /** M5 slice 2: which language every generated `prompt`/`teach`/enemy `name`/`title` is formatted
   * in — ferried in by the main thread (read from `localStorage`, see `./i18n`'s module doc).
   * Defaults to `"ro"` so every pre-slice-2 call site/test stays byte-identical. Fixed for the
   * WHOLE run (toggling it re-inits the sim — see `./i18n`'s module doc). */
  locale?: Locale;
}

/** The run's current top-level mode (M3 brief, Part A3/A4; M4a adds `"level_up"`/`"loot"`, both
 * interposed between a combat win and the run returning to `"map"` — see `proceed()`). */
export type RunMode = "map" | "combat" | "level_up" | "loot" | "run_won" | "run_lost";

/** The run's state, exposed on every `GameSnapshot` variant (M3 brief, Part A4; M4a adds
 * `level`/`xp`/`xpToNext`/`stats`/`inventory`). */
export interface RunView {
  readonly map: RunMap;
  /** The id of the node the active `Combat` (if any) is being fought at; `null` outside combat. */
  readonly currentId: number | null;
  /** Node ids the player may currently `chooseNode` into. */
  readonly reachableIds: readonly number[];
  /** Node ids the player has finished (fought-and-won, or rested at), in visit order. */
  readonly visitedIds: readonly number[];
  /** Persists across fights within a run; resets to `warriorMaxHp` on `newRun()`. */
  readonly warriorHp: number;
  /** Already includes the run's `stats.maxHp` bonus (M4a) — `WARRIOR_MAX_HP + stats.maxHp`. */
  readonly warriorMaxHp: number;
  /** Starts at 1, resets on `newRun()` (M4a). */
  readonly level: number;
  /** Cumulative XP toward the CURRENT level (already consumed past thresholds), resets to 0 on
   * `newRun()` (M4a). */
  readonly xp: number;
  /** `xpToNext(level)` for the CURRENT level — how much `xp` needs to reach to level up again. */
  readonly xpToNext: number;
  /** Accumulated combat stat bonuses from level-ups + loot this run; all-zero on `newRun()`. */
  readonly stats: StatBonuses;
  /** Items taken this run, in pickup order; empty on `newRun()`. */
  readonly inventory: readonly ItemView[];
  /** M4b: remaining lifeline charges per kind — starts at `STARTING_LIFELINES` (1 of each),
   * topped up by lifeline loot, resets on `newRun()`. */
  readonly lifelines: LifelineCharges;
  /** M4c: the persistent per-topic mastery store — the ONE field on `RunView` that does NOT reset
   * on `newRun()` (mastery survives death). The main thread writes this back to `localStorage`
   * whenever it changes (`client/src/main.ts`); the sim/worker never does so itself. */
  readonly mastery: MasteryStore;
}

/** The top-level sim/render boundary snapshot (M3 brief, Part A4; M4a adds `"level_up"`/`"loot"`)
 * — discriminated by `mode`. The M2 `answer`/`answerIndex` non-leak invariant still holds:
 * `combat` is the unchanged M2 `CombatSnapshot`. */
export type GameSnapshot =
  | { readonly mode: "map"; readonly run: RunView }
  | { readonly mode: "combat"; readonly run: RunView; readonly combat: CombatSnapshot }
  | { readonly mode: "level_up"; readonly run: RunView; readonly offers: readonly UpgradeOffer[] }
  | { readonly mode: "loot"; readonly run: RunView; readonly offers: readonly ItemView[] }
  | { readonly mode: "run_won"; readonly run: RunView }
  | { readonly mode: "run_lost"; readonly run: RunView };

export interface BootedMathquestSim {
  world: World<MathquestEntity>;
  scheduler: Scheduler;
  rng: Rng;
  /** Advances the sim by exactly one tick. Run/combat state never changes here — see the module doc. */
  step(): void;
  /** Returns a snapshot of the current run (render/transport boundary). */
  getSnapshot(): GameSnapshot;
  /**
   * Valid only in `"map"`, and only if `id` is in the current `reachableIds`; ignored otherwise
   * (no state change — the M3 brief's "unreachable node rejected"). A `"rest"` node heals
   * (`+REST_HEAL`, capped at `warriorMaxHp`), marks itself visited, and advances
   * `reachableIds` to its `next` — staying in `"map"`. A `"combat"`/`"elite"`/`"boss"` node
   * starts a fresh `Combat` (`rng.fork(`node:${id}`)`, that node's `grade` + `EnemyArchetype`,
   * the run's current `warriorHp`) and moves to `"combat"`.
   */
  chooseNode(id: number): void;
  /** Forwarded to the active `Combat` while `mode === "combat"`; ignored otherwise. Resolves the
   * run's state after (see `resolveCombatIfOver`) — a win accrues `xpEarned`, then hands off to
   * `proceed()` (M4a: `"level_up"` while any threshold was crossed, else `"loot"` for a non-boss
   * win, else `"run_won"` for the boss, else back to `"map"`); a loss ⇒ `"run_lost"`. */
  chooseAction(action: CombatAction): void;
  /** Forwarded to the active `Combat` while `mode === "combat"`; ignored otherwise. */
  submitAnswer(response: AnswerResponse): void;
  /** Forwarded to the active `Combat` while `mode === "combat"`; ignored otherwise. */
  acknowledgeTeach(): void;
  /** Valid only in `"level_up"`; ignored otherwise (M4a). Applies `UPGRADES[offers[index].kind]`
   * to `stats` (an `"hp"` pick also heals the warrior by the same delta, capped at the new max),
   * decrements `pendingLevelUps`, clears the offers, then calls `proceed()`. */
  chooseLevelUp(index: number): void;
  /** Valid only in `"loot"`; ignored otherwise (M4a). `index === -1` skips (no state change
   * beyond advancing); otherwise adds `offers[index]` to `inventory` and folds its `bonus` into
   * `stats` (a `maxHp` bonus also heals by that amount), then calls `proceed()`. */
  chooseLoot(index: number): void;
  /** M4b: forwarded to the active `Combat` while `mode === "combat"` and `lifelines[kind] > 0`;
   * ignored otherwise. Spends exactly one charge of `kind` ONLY when `Combat.useLifeline` reports
   * it actually applied (a `fifty` on a typed problem, or a repeat hint/fifty, spends nothing). A
   * `skip` may end the fight — `resolveCombatIfOver()` runs after, same as every other combat
   * command. */
  useLifeline(kind: LifelineKind): void;
  /** Valid only in `"run_won"`/`"run_lost"`; ignored otherwise. Regenerates the map from a fresh
   * fork (`rng.fork(`run:${n}`)`), resets `warriorHp` to full and ALL M4a progression (xp/level/
   * stats/inventory) to zero, and returns to `"map"` — a clean restart. */
  newRun(): void;
}

/**
 * Placeholder scheduler system: intentionally empty (no entities, no per-tick gameplay). Exists
 * purely so `step()` has something real to call and the ECS/Scheduler seam stays wired for a
 * later milestone, without `step()` itself ever touching run/combat state (see module doc).
 */
class NoopSystem implements System {
  readonly name = "NoopSystem";
  run(_ctx: SimContext): void {
    // Run/combat state changes ONLY inside chooseNode/chooseAction/submitAnswer/
    // acknowledgeTeach/newRun — never here.
  }
}

/** `run/map.ts`'s `NodeType` minus `"rest"` (which never fights, so never drops loot) is exactly
 * `run/loot.ts`'s `LootTier`. Only ever called on a `pendingWinNode` (a node a fight was just WON
 * at — `chooseNode` never starts a `Combat` for a `"rest"` node, so this can never see one in
 * practice); the runtime check turns "never happens" into a loud failure instead of a silent cast. */
function tierForNodeType(type: NodeType): LootTier {
  if (type === "rest") throw new Error("tierForNodeType: a 'rest' node never wins a fight");
  return type;
}

export function bootstrapMathquestSim(opts: MathquestSimOptions): BootedMathquestSim {
  const rng = createRng(opts.seed);
  const world = new World<MathquestEntity>();

  const scheduler = new Scheduler();
  scheduler.stage("TICK").add(new NoopSystem());

  // M4c: the persistent store, seeded from the caller (default EMPTY_MASTERY_STORE); NOT reset by
  // newRun() — see the module doc. Read by BOTH generateMap calls below (the elite gate) and every
  // rollLoot call (the blueprint-widened pool); written by resolveCombatIfOver on every fight end.
  let masteryStore: MasteryStore = opts.mastery ?? EMPTY_MASTERY_STORE;

  // M5 slice 2: fixed for the WHOLE run (a locale change re-inits the sim — see ./i18n's module
  // doc) — never reassigned, unlike the other `let`s below that reset on `newRun()`.
  const locale: Locale = opts.locale ?? DEFAULT_LOCALE;

  let runCount = 0;
  let map: RunMap = generateMap(rng.fork("map"), { eliteUnlocked: overallMasteryTier(masteryStore) >= ELITE_UNLOCK_TIER });
  let currentId: number | null = null;
  let reachableIds: readonly number[] = map.startIds;
  let visitedIds: readonly number[] = [];
  let mode: RunMode = "map";
  let combat: Combat | null = null;
  let frameCount = 0;

  // --- M4a progression/loot state — plain closed-over state, like everything else here; all
  // reset to these same initial values on `newRun()`. ------------------------------------------
  let level = 1;
  let xp = 0;
  let stats: StatBonuses = ZERO_STATS;
  let inventory: Item[] = [];
  // M4b: the run's lifeline charge kit — spread (never alias) `STARTING_LIFELINES`, since it is
  // this run's OWN mutable record, not a shared default.
  let lifelines: LifelineCharges = { ...STARTING_LIFELINES };
  let pendingLevelUps = 0;
  let levelUpOffers: UpgradeKind[] | null = null;
  let lootOffers: Item[] | null = null;
  /** The node a just-finished fight was won at, kept alive across the `"level_up"`/`"loot"`
   * detour so `proceed()` knows the win's tier (for `rollLoot`) and destination (for the eventual
   * `visitedIds`/`reachableIds` advance) without re-deriving it from `currentId` (already cleared
   * by `resolveCombatIfOver` by the time `proceed()` runs). `null` whenever no win is pending. */
  let pendingWinNode: MapNode | null = null;
  /** Whether THIS win's loot has already been resolved (taken or skipped) — a multi-level-up win
   * must not re-roll loot once level-ups are done; `proceed()` checks this before entering
   * `"loot"`. Meaningless while `pendingWinNode` is `null`. */
  let winLootResolved = false;

  /** `WARRIOR_MAX_HP + stats.maxHp` — the run's CURRENT effective max, recomputed on every read
   * so it always reflects the latest level-up/loot pickup (M4a); `WARRIOR_MAX_HP` alone would be
   * stale the instant `stats.maxHp` changes. */
  function maxHp(): number {
    return WARRIOR_MAX_HP + stats.maxHp;
  }

  let warriorHp = maxHp();

  function nodeById(id: number): MapNode | undefined {
    return map.nodes.find((n) => n.id === id);
  }

  function chooseNode(id: number): void {
    if (mode !== "map") return; // ignore off-mode commands
    if (!reachableIds.includes(id)) return; // unreachable — no state change
    const node = nodeById(id);
    if (node === undefined) return;

    if (node.type === "rest") {
      warriorHp = Math.min(maxHp(), warriorHp + REST_HEAL);
      visitedIds = [...visitedIds, id];
      reachableIds = node.next;
      return; // stays in "map"
    }

    currentId = id;
    combat = createCombat({
      rng: rng.fork(`node:${id}`),
      grade: node.grade,
      warriorHp,
      warriorMaxHp: maxHp(),
      // M5 folklore theming: the same stats as ENEMY_ARCHETYPES[node.type], zone-flavored
      // name/title only (see run/enemies.ts's enemyFor) — a pure function of (type, zone, locale),
      // no fork. M5 slice 2 adds `locale` (the run's own, fixed — see the module doc).
      enemy: enemyFor(node.type, node.zone, locale),
      mods: stats,
      locale,
    });
    mode = "combat";
  }

  /**
   * The M4a post-win state machine (brief's "Run flow" section) — called once right after a win
   * is detected (`resolveCombatIfOver`) and again after EVERY `chooseLevelUp`/`chooseLoot`, so a
   * fight that crosses several XP thresholds cycles through `"level_up"` once per threshold
   * before ever reaching `"loot"`, and the boss's win skips `"loot"` entirely (no gear after the
   * run is already over). Idempotent to call when `pendingWinNode` is `null` (a rest node, or any
   * mode that isn't mid-win) — becomes a no-op `mode = "map"` in that case, which is only ever
   * reached from within THIS module (never exposed as its own command).
   */
  function proceed(): void {
    if (pendingLevelUps > 0) {
      mode = "level_up";
      levelUpOffers = offerUpgrades(rng.fork("levelup"));
      return;
    }
    if (pendingWinNode !== null && pendingWinNode.type === "boss") {
      pendingWinNode = null;
      mode = "run_won";
      return;
    }
    if (pendingWinNode !== null && !winLootResolved) {
      mode = "loot";
      // M4c: unlocked blueprint items (`masteryStore.blueprints`) widen the BETTER pool — see
      // run/loot.ts's module doc. `blueprintItemsFor` returns `[]` for an empty store, so this is
      // byte-identical to pre-M4c when nothing has been unlocked yet.
      lootOffers = rollLoot(rng.fork("loot"), tierForNodeType(pendingWinNode.type), blueprintItemsFor(masteryStore.blueprints));
      return;
    }
    if (pendingWinNode !== null) {
      visitedIds = [...visitedIds, pendingWinNode.id];
      reachableIds = pendingWinNode.next;
      pendingWinNode = null;
    }
    mode = "map";
  }

  /** After forwarding a command to `combat`, resolve the run's state if the fight just ended.
   * No-op while the fight is still going (`combat.result()` is `null`). */
  function resolveCombatIfOver(): void {
    if (combat === null || currentId === null) return;
    const result = combat.result();
    if (result === null) return;

    warriorHp = result.warriorHp;
    const node = nodeById(currentId);
    combat = null;
    currentId = null;

    // M4c: fold this fight's per-topic outcomes into the persistent store BEFORE the win/loss
    // branch below — mastery is honest and survives death (a LOSS still counts its solves).
    masteryStore = foldTopicOutcomes(masteryStore, result.topicOutcomes);

    if (result.outcome === "lost") {
      mode = "run_lost";
      return;
    }

    // won (M4a): accrue XP, queue every threshold crossed (a single fight can cross several —
    // hence the `while`, not an `if`), then hand off to `proceed()`.
    xp += result.xpEarned;
    while (xp >= xpToNext(level)) {
      xp -= xpToNext(level);
      level += 1;
      pendingLevelUps += 1;
    }
    pendingWinNode = node ?? null;
    winLootResolved = false;
    proceed();
  }

  function chooseAction(action: CombatAction): void {
    if (mode !== "combat" || combat === null) return; // ignore off-mode commands
    combat.chooseAction(action);
    resolveCombatIfOver();
  }

  function submitAnswer(response: AnswerResponse): void {
    if (mode !== "combat" || combat === null) return; // ignore off-mode commands
    combat.submitAnswer(response);
    resolveCombatIfOver();
  }

  function acknowledgeTeach(): void {
    if (mode !== "combat" || combat === null) return; // ignore off-mode commands
    combat.acknowledgeTeach();
    resolveCombatIfOver();
  }

  /** M4b: forwards to the active `Combat`; spends a charge ONLY when it actually applied. A
   * `skip` may end the fight, so `resolveCombatIfOver()` runs after, same as every other combat
   * command. */
  function useLifeline(kind: LifelineKind): void {
    if (mode !== "combat" || combat === null) return; // ignore off-mode commands
    if (lifelines[kind] <= 0) return; // no charges — no-op
    const applied = combat.useLifeline(kind);
    if (applied) lifelines = { ...lifelines, [kind]: lifelines[kind] - 1 };
    resolveCombatIfOver();
  }

  function chooseLevelUp(index: number): void {
    if (mode !== "level_up" || levelUpOffers === null) return; // ignore off-mode commands
    const kind = levelUpOffers[index];
    if (kind === undefined) return; // out-of-range index — no state change
    const before = stats;
    stats = UPGRADES[kind].apply(stats);
    if (kind === "hp") {
      const healedBy = stats.maxHp - before.maxHp; // the upgrade's own HP_UPGRADE_AMOUNT
      warriorHp = Math.min(maxHp(), warriorHp + healedBy);
    }
    pendingLevelUps -= 1;
    levelUpOffers = null;
    proceed();
  }

  function chooseLoot(index: number): void {
    if (mode !== "loot" || lootOffers === null) return; // ignore off-mode commands
    if (index !== -1) {
      const item = lootOffers[index];
      if (item === undefined) return; // out-of-range index (and not the -1 skip) — no state change
      inventory = [...inventory, item];
      const before = stats;
      stats = foldItemBonus(stats, item.bonus);
      const healedBy = stats.maxHp - before.maxHp; // 0 unless the item carried a maxHp bonus
      if (healedBy !== 0) warriorHp = Math.min(maxHp(), warriorHp + healedBy);
      // M4b: a lifeline-granting item adds charges (not stats) — pure-lifeline items have
      // bonus:{} so the fold above is a no-op for them, and this is the ONLY effect they have.
      if (item.lifeline !== undefined) {
        const { kind, charges } = item.lifeline;
        lifelines = { ...lifelines, [kind]: lifelines[kind] + charges };
      }
    }
    winLootResolved = true;
    lootOffers = null;
    proceed();
  }

  function newRun(): void {
    if (mode !== "run_won" && mode !== "run_lost") return; // ignore off-mode commands
    runCount += 1;
    // M4c: eliteUnlocked is recomputed from the CURRENT (persisted) masteryStore — never reset by
    // newRun() (see the module doc); masteryStore itself is untouched below, unlike every other
    // run-scoped field.
    map = generateMap(rng.fork(`run:${runCount}`), { eliteUnlocked: overallMasteryTier(masteryStore) >= ELITE_UNLOCK_TIER });
    currentId = null;
    reachableIds = map.startIds;
    visitedIds = [];
    combat = null;
    // M4a: every run-scoped progression field resets to its fresh-boot value.
    level = 1;
    xp = 0;
    stats = ZERO_STATS;
    inventory = [];
    lifelines = { ...STARTING_LIFELINES };
    pendingLevelUps = 0;
    levelUpOffers = null;
    lootOffers = null;
    pendingWinNode = null;
    winLootResolved = false;
    warriorHp = maxHp(); // recompute AFTER stats resets to ZERO_STATS above
    mode = "map";
  }

  function getSnapshot(): GameSnapshot {
    const run: RunView = {
      map,
      currentId,
      reachableIds,
      visitedIds,
      warriorHp,
      warriorMaxHp: maxHp(),
      level,
      xp,
      xpToNext: xpToNext(level),
      stats,
      inventory: inventory.map((it) => toItemView(it, locale)),
      lifelines: { ...lifelines },
      mastery: masteryStore,
    };
    switch (mode) {
      case "combat":
        // Invariant: mode is "combat" iff combat is non-null (set together in chooseNode, both
        // cleared together in resolveCombatIfOver) — see those two functions.
        return { mode: "combat", run, combat: combat!.snapshot() };
      case "level_up":
        // Invariant: mode is "level_up" iff levelUpOffers is non-null (set together in `proceed`,
        // cleared together in `chooseLevelUp`).
        return { mode: "level_up", run, offers: levelUpOffers!.map((k) => describeUpgrade(k, locale)) };
      case "loot":
        // Invariant: mode is "loot" iff lootOffers is non-null (set together in `proceed`,
        // cleared together in `chooseLoot`).
        return { mode: "loot", run, offers: lootOffers!.map((it) => toItemView(it, locale)) };
      case "map":
        return { mode: "map", run };
      case "run_won":
        return { mode: "run_won", run };
      case "run_lost":
        return { mode: "run_lost", run };
    }
  }

  return {
    world,
    scheduler,
    rng,
    step(): void {
      scheduler.tick({ tick: frameCount });
      frameCount++;
    },
    getSnapshot,
    chooseNode,
    chooseAction,
    submitAnswer,
    acknowledgeTeach,
    useLifeline,
    chooseLevelUp,
    chooseLoot,
    newRun,
  };
}

