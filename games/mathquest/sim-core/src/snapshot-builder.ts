/**
 * Render-snapshot construction for MateQuest: `buildGameSnapshot`.
 *
 * Extracted verbatim from `bootstrapMathquestSim`'s closure (audit-24),
 * mirroring `games/hollow/sim-core/src/snapshot-builder.ts` and
 * `games/citadel/sim-core/src/snapshot-builder.ts` (audit-23), which in turn
 * follow `games/farm/sim-core/src/snapshot-builder/`.
 *
 * **Why a params object here, where the others take positional state.**
 * Hollow and Citadel keep their state in registries that were already passed
 * around; MateQuest's run state is ~18 plain closure locals. Threading them as
 * positional parameters would be unreadable and easy to transpose, so they are
 * gathered into one explicit, readonly {@link SnapshotInputs}. That is also
 * what makes a snapshot constructible from hand-built state in a test without
 * booting the sim — the point of the extraction.
 *
 * **Behaviour is unchanged by construction**: the field list on `RunView`, the
 * `mode` switch, and the non-null assertions (each guarded by an invariant the
 * bootstrap maintains, restated below) are exactly as they were inline.
 *
 * **Locale is an input, not a default.** The bootstrap owns the run's locale
 * (MateQuest's UI defaults to Romanian); this builder never substitutes one.
 */
import type { CombatSnapshot } from "./combat/types";
import type { Locale } from "./i18n";
import type { RunMap } from "./run/map";
import { toItemView, type Item, type ItemView } from "./run/loot";
import type { LifelineCharges } from "./run/lifelines";
import type { MasteryStore } from "./run/mastery";
import { describeUpgrade, xpToNext, type StatBonuses, type UpgradeKind } from "./run/progression";
import type { GameSnapshot, RunMode, RunView } from "./sim-bootstrap";

/** Everything `getSnapshot` used to read off `bootstrapMathquestSim`'s closure. */
export interface SnapshotInputs {
  readonly mode: RunMode;
  readonly map: RunMap;
  readonly currentId: number | null;
  readonly reachableIds: readonly number[];
  readonly visitedIds: readonly number[];
  readonly warriorHp: number;
  readonly warriorMaxHp: number;
  readonly level: number;
  readonly xp: number;
  readonly stats: StatBonuses;
  readonly inventory: readonly Item[];
  readonly lifelines: LifelineCharges;
  readonly mastery: MasteryStore;
  readonly locale: Locale;
  /** Non-null iff `mode === "combat"` — set and cleared with it. */
  readonly combat: { snapshot(): CombatSnapshot } | null;
  /** Non-null iff `mode === "level_up"` — set and cleared with it. */
  readonly levelUpOffers: readonly UpgradeKind[] | null;
  /** Non-null iff `mode === "loot"` — set and cleared with it. */
  readonly lootOffers: readonly Item[] | null;
}

/** The run-state half of the snapshot, shared by every mode. */
export function buildRunView(i: SnapshotInputs): RunView {
  return {
    map: i.map,
    currentId: i.currentId,
    reachableIds: i.reachableIds,
    visitedIds: i.visitedIds,
    warriorHp: i.warriorHp,
    warriorMaxHp: i.warriorMaxHp,
    level: i.level,
    xp: i.xp,
    xpToNext: xpToNext(i.level),
    stats: i.stats,
    inventory: i.inventory.map((it) => toItemView(it, i.locale)),
    lifelines: { ...i.lifelines },
    mastery: i.mastery,
  };
}

export function buildGameSnapshot(i: SnapshotInputs): GameSnapshot {
  const run = buildRunView(i);
  switch (i.mode) {
    case "combat":
      // Invariant: mode is "combat" iff combat is non-null (set together in chooseNode, both
      // cleared together in resolveCombatIfOver) — see those two functions.
      return { mode: "combat", run, combat: i.combat!.snapshot() };
    case "level_up":
      // Invariant: mode is "level_up" iff levelUpOffers is non-null (set together in `proceed`,
      // cleared together in `chooseLevelUp`).
      return { mode: "level_up", run, offers: i.levelUpOffers!.map((k) => describeUpgrade(k, i.locale)) };
    case "loot":
      // Invariant: mode is "loot" iff lootOffers is non-null (set together in `proceed`,
      // cleared together in `chooseLoot`).
      return { mode: "loot", run, offers: i.lootOffers!.map((it) => toItemView(it, i.locale)) };
    case "map":
      return { mode: "map", run };
    case "run_won":
      return { mode: "run_won", run };
    case "run_lost":
      return { mode: "run_lost", run };
  }
}
