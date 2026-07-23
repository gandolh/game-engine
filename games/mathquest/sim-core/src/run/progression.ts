/**
 * MateQuest M4a — in-run progression (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md):
 * XP earned per correct solve, the level-up threshold curve, and the four upgrade kinds a
 * level-up offers. Everything here resets per run (`sim-bootstrap.ts`'s `newRun()`) — there is no
 * persistence yet (that's M4c).
 *
 * Determinism (root CLAUDE.md): `offerUpgrades` consumes ONLY the `Rng` it's handed — the driver
 * forks a named child (`rng.fork("levelup")`) before calling it — never `Math.random()`/`Date.now()`.
 */
import type { Rng } from "@engine/core";
import type { Grade } from "../combat/types";
import { DEFAULT_LOCALE, type Locale } from "../i18n";

/** Accumulated combat stat bonuses, folded in from level-ups (`hp`/`atk`/`block`/`heal` upgrades)
 * and loot (`run/loot.ts`'s `Item.bonus`). All start at 0; reset to 0 on `newRun()`. */
export interface StatBonuses {
  readonly atk: number;
  readonly maxHp: number;
  readonly block: number;
  readonly heal: number;
}

export const ZERO_STATS: StatBonuses = { atk: 0, maxHp: 0, block: 0, heal: 0 };

/** XP a single CORRECT solve earns, at the fight's fixed grade — hard branches reward more. */
export function xpForSolve(grade: Grade): number {
  return grade;
}

/** XP required to advance FROM level `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 5 * level;
}

export type UpgradeKind = "hp" | "atk" | "block" | "heal";

/** The stat delta each upgrade kind grants — LOCKED amounts (M4a brief). */
const HP_UPGRADE_AMOUNT = 6;
const ATK_UPGRADE_AMOUNT = 2;
const BLOCK_UPGRADE_AMOUNT = 3;
const HEAL_UPGRADE_AMOUNT = 3;

/** Pure per-kind appliers — each returns a NEW `StatBonuses`, never mutates its argument. The
 * driver additionally heals `+HP_UPGRADE_AMOUNT` on an `"hp"` pick (not this module's job — it
 * has no warrior HP to touch). */
export const UPGRADES: Record<UpgradeKind, { readonly apply: (s: StatBonuses) => StatBonuses }> = {
  hp: { apply: (s) => ({ ...s, maxHp: s.maxHp + HP_UPGRADE_AMOUNT }) },
  atk: { apply: (s) => ({ ...s, atk: s.atk + ATK_UPGRADE_AMOUNT }) },
  block: { apply: (s) => ({ ...s, block: s.block + BLOCK_UPGRADE_AMOUNT }) },
  heal: { apply: (s) => ({ ...s, heal: s.heal + HEAL_UPGRADE_AMOUNT }) },
};

const ALL_UPGRADE_KINDS: readonly UpgradeKind[] = ["hp", "atk", "block", "heal"];

/** Display-ready projection of an upgrade offer — sim-side RO text (like a generator's `prompt`),
 * so the client never needs its own copy of the upgrade amounts. */
export interface UpgradeOffer {
  readonly kind: UpgradeKind;
  readonly label: string;
  readonly desc: string;
}

const UPGRADE_TEXT: Record<UpgradeKind, { readonly label: string; readonly desc: string }> = {
  hp: { label: "Elixir de viață", desc: `+${HP_UPGRADE_AMOUNT} PS maxime (vindecă acum)` },
  atk: { label: "Antrenament de luptă", desc: `+${ATK_UPGRADE_AMOUNT} daune la Atacă` },
  block: { label: "Tehnică de apărare", desc: `+${BLOCK_UPGRADE_AMOUNT} blocaj la Scut` },
  heal: { label: "Meditație tămăduitoare", desc: `+${HEAL_UPGRADE_AMOUNT} vindecare la Vindecă` },
};

/** M5 slice 2: the English translation of `UPGRADE_TEXT` (RO stays the default — see `i18n.ts`).
 * Action words match `strings.ts`'s `STRINGS_EN.actionLabel` (Attack/Shield/Heal). */
const UPGRADE_TEXT_EN: Record<UpgradeKind, { readonly label: string; readonly desc: string }> = {
  hp: { label: "Life Elixir", desc: `+${HP_UPGRADE_AMOUNT} max HP (heals now)` },
  atk: { label: "Combat Training", desc: `+${ATK_UPGRADE_AMOUNT} damage to Attack` },
  block: { label: "Defense Technique", desc: `+${BLOCK_UPGRADE_AMOUNT} block to Shield` },
  heal: { label: "Healing Meditation", desc: `+${HEAL_UPGRADE_AMOUNT} healing to Heal` },
};

export function describeUpgrade(kind: UpgradeKind, locale: Locale = DEFAULT_LOCALE): UpgradeOffer {
  return { kind, ...(locale === "en" ? UPGRADE_TEXT_EN : UPGRADE_TEXT)[kind] };
}

/** `count` DISTINCT upgrade kinds, deterministic — a Fisher-Yates shuffle of the fixed 4, capped
 * at `count` (mirrors `run/map.ts`'s local `shuffledRange`, kept independent so this module has no
 * dependency on `run/map.ts`). */
export function offerUpgrades(rng: Rng, count = 2): UpgradeKind[] {
  const idx = [...ALL_UPGRADE_KINDS];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx.slice(0, Math.min(count, idx.length));
}
