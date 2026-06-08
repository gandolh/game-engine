// ── Fishing ────────────────────────────────────────────────────────────────
//
// Fishing is a low-AP, high-time activity: it costs 1 AP but the farmer is busy
// for a random 5–30 seconds (at 20 Hz → 100–600 ticks), then lands one of three
// fish. There is exactly ONE kind of fishing rod and it has NO durability
// (modelled with `durability: Infinity` so the shared tool plumbing never
// breaks or prunes it). You fish while standing adjacent to a fishing spot.

/**
 * The catchable fish, in ascending value. The first three are shore fish
 * (cast from a fishing isle). The last two are SPECIAL coral-reef species
 * (brief 48) — only landed by fishing AT a coral spot, reached by boat. They
 * are far more valuable, the payoff that justifies rowing out to the reef.
 */
export type FishKind =
  | "minnow" | "bass" | "salmon"     // shore fish (any fishing-isle edge)
  | "coral-trout" | "lobster";       // coral-reef specials (brief 48 — boat only)

export const FISH_KINDS: readonly FishKind[] = [
  "minnow", "bass", "salmon", "coral-trout", "lobster",
];

/** The shore-only subset (used by the shore-fishing weight tables). */
export const SHORE_FISH_KINDS: readonly FishKind[] = ["minnow", "bass", "salmon"];

/** brief 48 — the coral-reef-only subset (special, high-value species). */
export const CORAL_FISH_KINDS: readonly FishKind[] = ["coral-trout", "lobster"];

/** Gold each fish is worth when sold to the shopkeeper. */
export const FISH_VALUE: Record<FishKind, number> = {
  minnow: 1,
  bass:   3,
  salmon: 5,
  // Coral specials carry a steep premium over the best shore fish (salmon=5),
  // so the boat trip's travel/AP cost pays back. lobster is the jackpot.
  "coral-trout": 12,
  lobster:       20,
};

/** Fishing time bounds, in ticks at 20 Hz (5 s … 30 s). */
export const FISH_MIN_TICKS = 100; // 5 s
export const FISH_MAX_TICKS = 600; // 30 s

/**
 * Catch odds, as [minnow, bass, salmon] weights. Plain ocean (calm water) mostly
 * lands the cheap minnow; casting into a bubble spot tilts heavily toward the
 * rarer, more valuable bass/salmon. Weights need not sum to 1 — the picker
 * normalises. This is the whole point of the bubbles: a rarity bonus.
 */
export const FISH_WEIGHTS_CALM:   Record<FishKind, number> = { minnow: 80, bass: 17, salmon: 3, "coral-trout": 0, lobster: 0 };
export const FISH_WEIGHTS_BUBBLE: Record<FishKind, number> = { minnow: 25, bass: 45, salmon: 30, "coral-trout": 0, lobster: 0 };

/**
 * brief 48 — coral-reef catch odds, as weights over the special species only.
 * Fishing at a reef always lands a special fish; the common coral-trout
 * dominates with the rare lobster as the jackpot. The fishing-skill rarity
 * bonus reallocates a fraction of coral-trout weight toward lobster (see
 * applyCoralRarityBonus), so a master angler hooks more lobsters.
 */
export const CORAL_WEIGHTS: Record<FishKind, number> = {
  minnow: 0, bass: 0, salmon: 0,
  "coral-trout": 78,
  lobster:       22,
};

/** brief 48 — true if a fish kind is a coral-reef special (not shore-catchable). */
export function isCoralFish(kind: FishKind): boolean {
  return kind === "coral-trout" || kind === "lobster";
}

/** A fresh all-zero fish tally (every kind, incl. coral specials). Use this to
 *  lazily initialise `inventory.fish` so it always has every key present. */
export function zeroFish(): Record<FishKind, number> {
  return { minnow: 0, bass: 0, salmon: 0, "coral-trout": 0, lobster: 0 };
}
